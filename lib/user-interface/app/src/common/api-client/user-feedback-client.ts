import { Utils } from "../utils"
import { AppConfig } from "../types";

export class UserFeedbackClient {


  private readonly API;
  constructor(protected _appConfig: AppConfig) {
    /** The CDK script adds an extra slash at the end so this just removes it */
    this.API = _appConfig.httpEndpoint.slice(0, -1);
  }

  // Takes in a piece of feedback (which has a prompt, completion, session ID, and the actual feedback (1 or 0))
  async sendUserFeedback(feedbackData) {

    console.log(feedbackData);
    const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
      },
      body: JSON.stringify({ feedbackData })
    });
    /** TODO: add error handling for when it does not go through successfully.
     * I neglected to do so because this is not critical functionality
     */
    console.log(response);
  }

  /** This is similar to getUserFeedback below, but initiates a CSV download */
  async downloadFeedback(topic: string, startTime?: string, endTime?: string) {
    const auth = await Utils.authenticate();

    /** This fetch call will get a presigned URL for downloading from S3 */
    const response = await fetch(this.API + '/user-feedback/download-feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth
      },
      body: JSON.stringify({ topic, startTime, endTime })
    });
    const result = await response.json();

    /** Now that we have the presigned URL, we can initiate a download */
    fetch(result.download_url, {
      method: 'GET',
      headers: {
        'Content-Disposition': 'attachment',
      }

    }).then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = "data.csv";
        document.body.appendChild(a); // we need to append the element to the dom -> otherwise it will not work in firefox
        a.click();
        a.remove();  //afterwards we remove the element again
      });

  }

  async getUserFeedback(topic: string, startTime?: string, endTime?: string, nextPageToken?: string) {

    const auth = await Utils.authenticate();
    let params = new URLSearchParams({ topic, startTime, endTime, nextPageToken });

    /** If the parameters are undefined, we don't want those being passed to the API, so 
     * this will delete any undefined parameters if needed. Admittedly, the API should handle this
     * sitation but it sadly does not.
    */
    let keysForDel = [];
    params.forEach((value, key) => {
      if (value === undefined || value == "undefined") {
        keysForDel.push(key);
      }
    });
    keysForDel.forEach(key => {
      params.delete(key);
    });

    const response = await fetch(this.API + '/user-feedback?' + params.toString(), {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth,
      },
    });
    const result = await response.json();
    return result;
  }

  async deleteFeedback(topic: string, createdAt: string) {
    const auth = await Utils.authenticate();
    let params = new URLSearchParams({ topic, createdAt });
    await fetch(this.API + '/user-feedback?' + params.toString(), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': auth
      },
    });

  }
}
