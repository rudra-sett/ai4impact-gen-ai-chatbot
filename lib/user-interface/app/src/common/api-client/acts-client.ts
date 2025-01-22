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
      console.error('Failed to get files');
      return "Enter a year and chapter to retrieve an Act";
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

  async getAmendments(year: string, chapter: string) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/get-amendments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization' : auth
      },
      body: JSON.stringify({
        year: year,
        chapter: chapter        
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to get amendments');
    }
    const result = await response.json();
    return result;
  }

  async insertAmendment(year: string, chapter: string, amendingYear : string, amendingChapter : string, clientText : string) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/insert-amendment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization' : auth
      },
      body: JSON.stringify({
        year: year,
        chapter: chapter,
        amend_year: amendingYear,
        amend_chapter: amendingChapter,
        client_text: clientText        
      }),
    });
    if (!response.ok) {
      throw new Error('Failed to get amendments');
    }
    const result = await response.json();
    return result;
  }

  async listActs(year: string, startIndex: number, pageSize: number) {
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + `/list-acts?year=${year}&startIndex=${startIndex}&pageSize=${pageSize}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization' : auth
      },
    });
    if (!response.ok) {
      throw new Error('Failed to get amendments');
    }
    const result = await response.json();
    return result;
  }
}