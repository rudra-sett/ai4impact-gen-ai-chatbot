import {
  Utils
} from "../utils"

import { AppConfig } from "../types";

export class ActsClient {

  private readonly API : string;
  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint.slice(0,-1);
  }

  async getAct(year: string, chapter: string) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/get-act', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization' : auth
      },
      body: JSON.stringify({
        year: year,
        chapter: chapter,
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to get files');
    }
    const result = await response.json();
    return result;
  }

  async searchLaws(query: string) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/search-laws', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization' : auth
      },
      body: JSON.stringify({
        query: query,        
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to get laws');
    }
    const result = await response.json();
    return result;
  }
}