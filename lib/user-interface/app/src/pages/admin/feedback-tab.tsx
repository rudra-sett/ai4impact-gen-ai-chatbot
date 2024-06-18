import {
  Box,
  SpaceBetween,
  Table,
  DateRangePicker,
  Pagination,
  Button,
  Header,
  Modal,
  Select,
  DateRangePickerProps,
} from "@cloudscape-design/components";
import { I18nProvider } from '@cloudscape-design/components/i18n';
import messages from '@cloudscape-design/components/i18n/messages/all.all';
import { useCallback, useContext, useEffect, useRef, useState } from "react";
import { ApiClient } from "../../common/api-client/api-client";
import { AppContext } from "../../common/app-context";
import { getColumnDefinition } from "./columns";
import { Utils } from "../../common/utils";
import { useCollection } from "@cloudscape-design/collection-hooks";
import React from 'react';
import { useNotifications } from "../../components/notif-manager";
import { feedbackCategories } from '../../common/constants'

export interface FeedbackTabProps {
  updateSelectedFeedback: React.Dispatch<any>;
}

export default function FeedbackTab(props: FeedbackTabProps) {
  const appContext = useContext(AppContext);
  const apiClient = new ApiClient(appContext);
  const [loading, setLoading] = useState(true);
  const [currentPageIndex, setCurrentPageIndex] = useState(1);
  const [pages, setPages] = useState<any[]>([]);
  const [selectedItems, setSelectedItems] = useState<any[]>([]);
  const [showModalDelete, setShowModalDelete] = useState(false);
  const needsRefresh = useRef<boolean>(false);

  const [
    selectedOption,
    setSelectedOption
  ] = React.useState({ label: "Any", value: "any" });
  const [value, setValue] = React.useState<DateRangePickerProps.AbsoluteValue>({
    type: "absolute",
    startDate: (new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate() - 1)).toISOString().split("T")[0],
    endDate: (new Date()).toISOString().split("T")[0]
  });

  const { addNotification, removeNotification } = useNotifications();

  /** Theoretically handles pagination but I think it works without this actually */
  const { items, collectionProps, paginationProps } = useCollection(pages, {
    filtering: {
      empty: (
        <Box margin={{ vertical: "xs" }} textAlign="center" color="inherit">
          <SpaceBetween size="m">
            <b>No feedback</b>
          </SpaceBetween>
        </Box>
      ),
    },
    pagination: { pageSize: 5 },
    sorting: {
      defaultState: {
        sortingColumn: {
          sortingField: "FeedbackID",
        },
        isDescending: true,
      },
    },
    selection: {},
  });

  /** This is the memoized function that is used to get feedback. It takes in a
   * page index to set the data locally to the correct page as well as a token that the
   * API uses to paginate the results.
   */
  const getFeedback = useCallback(
    async (params: { pageIndex?, nextPageToken?}) => {
      setLoading(true);
      try {
        const result = await apiClient.userFeedback.getUserFeedback(selectedOption.value, value.startDate + "T00:00:00", value.endDate + "T23:59:59", params.nextPageToken)

        setPages((current) => {
          /** When any of the filters change, we want to reset the display back to page 1.
           * Therefore, when needsRefresh is true, we want to set the pages array so that whatever was just retrieved
           * is set as the first page
           */
          if (needsRefresh.current) {
            needsRefresh.current = false;
            return [result];
          }
          /** If there was a provided page index, then pop it in that index */
          if (typeof params.pageIndex !== "undefined") {
            current[params.pageIndex - 1] = result;
            return [...current];
          } else {
            /** Otherwise, not, and just append it to the end and hope it's correct */
            console.log("pages?")
            return [...current, result];
          }
        });
      } catch (error) {
        console.error(Utils.getErrorMessage(error));
      }
      setLoading(false);
    },
    [appContext, selectedOption, value, needsRefresh]
  );


  /** The getFeedback function is a memoized function.
   * When any of the filters change, getFeedback will also change and we therefore need a refresh
   */
  useEffect(() => {
    setCurrentPageIndex(1);
    setSelectedItems([]);
    if (needsRefresh.current) {
      // console.log("needs refresh!")
      getFeedback({ pageIndex: 1 });
    } else {
      getFeedback({ pageIndex: currentPageIndex });
    }
  }, [getFeedback]);

  /** Handles next page clicks */
  const onNextPageClick = async () => {
    const continuationToken = pages[currentPageIndex - 1]?.NextPageToken;
    if (continuationToken) {
      if (pages.length <= currentPageIndex || needsRefresh.current) {
        await getFeedback({ nextPageToken: continuationToken });
      }
      setCurrentPageIndex((current) => Math.min(pages.length + 1, current + 1));
    }
  };

  /** Handles previous page clicks */
  const onPreviousPageClick = async () => {
    setCurrentPageIndex((current) =>
      Math.max(1, Math.min(pages.length - 1, current - 1))
    );
  };

  /** Handles page refreshes */
  const refreshPage = async () => {
    if (currentPageIndex <= 1) {
      await getFeedback({ pageIndex: currentPageIndex });
    } else {
      const continuationToken = pages[currentPageIndex - 2]?.NextPageToken!;
      await getFeedback({ pageIndex: currentPageIndex, nextPageToken: continuationToken });
    }
  };


  const columnDefinitions = getColumnDefinition("feedback");

  /** Deletes all selected feedback */
  const deleteSelectedFeedback = async () => {
    if (!appContext) return;
    setLoading(true);
    setShowModalDelete(false);
    const apiClient = new ApiClient(appContext);
    await Promise.all(
      selectedItems.map((s) => apiClient.userFeedback.deleteFeedback(s.Topic, s.CreatedAt))
    );
    await getFeedback({ pageIndex: currentPageIndex });
    setSelectedItems([])
    setLoading(false);
  };



  return (
    <>
      <Modal
        onDismiss={() => setShowModalDelete(false)}
        visible={showModalDelete}
        footer={
          <Box float="right">
            <SpaceBetween direction="horizontal" size="xs">
              {" "}
              <Button variant="link" onClick={() => setShowModalDelete(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={deleteSelectedFeedback}>
                Ok
              </Button>
            </SpaceBetween>{" "}
          </Box>
        }
        header={"Delete feedback" + (selectedItems.length > 1 ? "s" : "")}
      >
        Do you want to delete{" "}
        {selectedItems.length == 1
          ? `Feedback ${selectedItems[0].FeedbackID!}?`
          : `${selectedItems.length} Feedback?`}
      </Modal>
      <I18nProvider locale="en" messages={[messages]}>


        <Table
          {...collectionProps}
          loading={loading}
          loadingText={`Loading Feedback`}
          columnDefinitions={columnDefinitions}
          selectionType="single"
          onSelectionChange={({ detail }) => {
            // console.log(detail);
            // needsRefresh.current = true;
            props.updateSelectedFeedback(detail.selectedItems[0])
            setSelectedItems(detail.selectedItems);
          }}
          selectedItems={selectedItems}
          items={pages[Math.min(pages.length - 1, currentPageIndex - 1)]?.Items!}
          trackBy="FeedbackID"
          header={
            <Header
              actions={
                <SpaceBetween direction="horizontal" size="xs">
                  <DateRangePicker
                    onChange={({ detail }) => {
                      /** If the date changes, refresh all of the feedback. This
                       * prevents bugs where one page is up-to-date and the previous/next ones are not
                       */
                      needsRefresh.current = true;
                      setValue(detail.value as DateRangePickerProps.AbsoluteValue)
                    }}
                    value={value as DateRangePickerProps.AbsoluteValue}
                    relativeOptions={[
                      {
                        key: "previous-5-minutes",
                        amount: 5,
                        unit: "minute",
                        type: "relative"
                      },
                      {
                        key: "previous-30-minutes",
                        amount: 30,
                        unit: "minute",
                        type: "relative"
                      },
                      {
                        key: "previous-1-hour",
                        amount: 1,
                        unit: "hour",
                        type: "relative"
                      },
                      {
                        key: "previous-6-hours",
                        amount: 6,
                        unit: "hour",
                        type: "relative"
                      }
                    ]}

                    isValidRange={range => {
                      if (range.type === "absolute") {
                        const [
                          startDateWithoutTime
                        ] = range.startDate.split("T");
                        const [
                          endDateWithoutTime
                        ] = range.endDate.split("T");
                        if (
                          !startDateWithoutTime ||
                          !endDateWithoutTime
                        ) {
                          return {
                            valid: false,
                            errorMessage:
                              "The selected date range is incomplete. Select a start and end date for the date range."
                          };
                        }
                        if (
                          +new Date(range.startDate) - +new Date(range.endDate) > 0
                        ) {
                          return {
                            valid: false,
                            errorMessage:
                              "The selected date range is invalid. The start date must be before the end date."
                          };
                        }
                      }
                      return { valid: true };
                    }}
                    i18nStrings={{}}
                    placeholder="Filter by a date and time range"
                    showClearButton={false}
                    dateOnly
                    timeInputFormat="hh:mm:ss"
                    rangeSelectorMode="absolute-only"
                  />
                  <Select
                    selectedOption={selectedOption}
                    onChange={({ detail }) => {
                      /** If the topic changes, refresh all of the feedback */
                      needsRefresh.current = true;
                      setSelectedOption({ label: detail.selectedOption.label!, value: detail.selectedOption.value });
                    }}
                    placeholder="Choose a category"
                    options={feedbackCategories}
                  />
                  <Button iconName="refresh" onClick={refreshPage} />
                  <Button
                    variant="primary"
                    onClick={() => {
                      apiClient.userFeedback.downloadFeedback(selectedOption.value, value.startDate, value.endDate);
                      const id = addNotification("success", "Your files have been downloaded.")
                      Utils.delay(3000).then(() => removeNotification(id));
                    }}
                  >Download</Button>
                  <Button
                    variant="primary"
                    disabled={selectedItems.length == 0}
                    onClick={() => {
                      if (selectedItems.length > 0) setShowModalDelete(true);
                    }}
                    data-testid="submit">
                    Delete
                  </Button>
                </SpaceBetween>
              }
              description="Please expect a delay for your changes to be reflected. Press the refresh button to see the latest changes."
            >
              {"Feedback"}

            </Header>
          }
          empty={
            <Box textAlign="center">No feedback available</Box>
          }
          pagination={
            pages.length === 0 ? null : (
              <Pagination
                openEnd={true}
                pagesCount={pages.length}
                currentPageIndex={currentPageIndex}
                onNextPageClick={onNextPageClick}
                onPreviousPageClick={onPreviousPageClick}
              />
            )
          }
        />
      </I18nProvider>
    </>


  );
}
