import {Utils} from "../utils"
//import {API} from "../constants"
import { AppConfig } from "../types"; 
export class UserFeedbackClient {
  private readonly API;
  constructor(protected _appConfig: AppConfig) {
    this.API = _appConfig.httpEndpoint.slice(0,-1);}

  // Takes in a piece of feedback (which has a prompt, completion, session ID, and the actual feedback (1 or 0))
  async sendUserFeedback(feedbackData) {

    // TODO: use API Gateway
    console.log(feedbackData);
    // const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': auth, 
      },
      body: JSON.stringify({ feedbackData })
    });
  }

  async downloadFeedback(topic : string, startTime? : string, endTime? : string) {
    // const auth = await Utils.authenticate();
    const response = await fetch(this.API + '/user-feedback/download-feedback', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': auth
      },
      body: JSON.stringify({ topic, startTime, endTime })
    });
    const result = await response.json();
  
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
    
    //const blob = await file.blob();
    

  }

  async getUserFeedback(topic : string, startTime? : string, endTime? : string, nextPageToken? : string) {
    
    // const auth = await Utils.authenticate();
    let params = new URLSearchParams({topic,startTime,endTime,nextPageToken});
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
        // 'Authorization': auth, 
      },      
    });
    const result = await response.json();
    return result;
  }

  async deleteFeedback(topic : string, createdAt : string) {
    // const auth = await Utils.authenticate();
    let params = new URLSearchParams({topic, createdAt});
    await fetch(this.API + '/user-feedback?' + params.toString(), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        // 'Authorization': auth
      },      
    });
    
  }
}
