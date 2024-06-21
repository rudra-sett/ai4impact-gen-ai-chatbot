export class FileUploader {
  // This function takes in a file, a signed S3 upload URL, and a callback handler for progress indication in order to upload a file to S3
  upload(
    file: File,
    url: string,
    type: string,
    onProgress: (uploaded: number) => void
  ): Promise<boolean> {
    return new Promise((resolve, reject) => {
      const formData = new FormData();  
      /*fields.split(",").forEach((f) => {
        const sepIdx = f.indexOf("=");
        const k = f.slice(0, sepIdx);
        const v = f.slice(sepIdx + 1);
        formData.append(k, v);
      }); */ 
      formData.append("file", file);
      const xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function () {
        if (xhr.readyState === XMLHttpRequest.DONE) {
          if (xhr.status === 200 || xhr.status === 204) {
            resolve(true);
          } else {
            reject(false);
          }
        }
      };

      xhr.open("PUT", url, true);
      xhr.setRequestHeader("Content-Type",type);
      xhr.upload.addEventListener("progress", (event) => {
        onProgress(event.loaded);
      });
      xhr.send(file);
    });
  }
}
