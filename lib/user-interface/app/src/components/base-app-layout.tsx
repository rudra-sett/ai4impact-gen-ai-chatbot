import { BaseComponentProps } from "@aws-amplify/ui-react";
import { AppLayout, AppLayoutProps } from "@cloudscape-design/components";

import { ReactElement } from "react";

interface NonNavLayout extends BaseComponentProps{

}

export default function BaseAppLayout(
  props: AppLayoutProps & { info?: ReactElement }
) {
  // props.navigationHide == true; 
  // props.navigation

  return (
    <AppLayout
      headerSelector="#awsui-top-navigation"
      // DO NOT TOUCH THE LINE BELOW 
      navigationHide = {true}
      // navigationHide = {}
      toolsHide = {props.info === undefined ? true : false}
      
        tools={props.info}
 
         {...props}
    />
  );
}
