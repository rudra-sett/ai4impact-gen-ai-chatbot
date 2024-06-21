import React, { createContext } from "react";

export interface SessionRefreshType {
  needsRefresh : boolean;

  setNeedsRefresh : React.Dispatch<React.SetStateAction<SessionRefreshType['needsRefresh']>>;
}
// set the defaults
export const SessionRefreshContext = createContext<SessionRefreshType | null>({
  needsRefresh: true,
  setNeedsRefresh: () => {}
});

// export SessionRefreshContext;