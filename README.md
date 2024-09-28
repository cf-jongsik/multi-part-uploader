# R2 Multipart Upload Example

This is a simple example of how to use the R2 multipart upload API with Hono.

## Endpoints

### `POST /:key?action=mpu-create`

Creates a new multipart upload for the given key.

**Request:**

`POST /:key?action=mpu-create`

**Response:**

```json
{
	"key": "string",
	"uploadId": "string"
}
```

## Endpoints

### `PUT /:key?action=mpu-uploadpart`

Uploads a part for the given key, uploadId, and partNumber.

**Request:**

`PUT /:key?action=mpu-uploadpart&uploadId=:uploadId&partNumber=:partNumber`

**Response:**

```json
{
	"etag": "string",
	"partNumber": "number"
}
```

## Endpoints

### `POST /:key?action=mpu-complete&uploadId=:uploadId`

Completes the multipart upload for the given key and uploadId.

**Request:**

```json
{
	"parts": [
		{
			"etag": "string",
			"partNumber": "number"
		}
	]
}
```

**Response:**

```json
{
	"etag": "string"
}
```

## Endpoints

### `GET /:key?action=get`

Gets the object for the given key.

**Request:**

`GET /:key?action=get`

**Response:**

`200 OK`

## Endpoints

### `DELETE /:key?action=mpu-abort&uploadId=:uploadId`

Aborts the multipart upload for the given key and uploadId.

**Request:**

`DELETE /:key?action=mpu-abort&uploadId=:uploadId`

**Response:**

`204 No Content`

## Endpoints

### `DELETE /:key?action=delete`

Deletes the object for the given key.

**Request:**

`DELETE /:key?action=delete`

**Response:**

`204 No Content`

# Error Handling

```javascript
All endpoints return a 400 Bad Request response if the request is invalid.
```

# Example Usage - python

```python
import math
import os
import requests
from requests.adapters import HTTPAdapter, Retry
import sys
import concurrent.futures

# Take the file to upload as an argument
filename = sys.argv[1]
# The endpoint for our worker, change this to wherever you deploy your worker
worker_endpoint = "https://myworker.myzone.workers.dev/"
# Configure the part size to be 10MB. 5MB is the minimum part size, except for the last part
partsize = 10 * 1024 * 1024


def upload_file(worker_endpoint, filename, partsize):
    url = f"{worker_endpoint}{filename}"

    # Create the multipart upload
    uploadId = requests.post(url, params={"action": "mpu-create"}).json()["uploadId"]

    part_count = math.ceil(os.stat(filename).st_size / partsize)
    # Create an executor for up to 25 concurrent uploads.
    executor = concurrent.futures.ThreadPoolExecutor(25)
    # Submit a task to the executor to upload each part
    futures = [
        executor.submit(upload_part, filename, partsize, url, uploadId, index)
        for index in range(part_count)
    ]
    concurrent.futures.wait(futures)
    # get the parts from the futures
    uploaded_parts = [future.result() for future in futures]

    # complete the multipart upload
    response = requests.post(
        url,
        params={"action": "mpu-complete", "uploadId": uploadId},
        json={"parts": uploaded_parts},
    )
    if response.status_code == 200:
        print("🎉 successfully completed multipart upload")
    else:
        print(response.text)


def upload_part(filename, partsize, url, uploadId, index):
    # Open the file in rb mode, which treats it as raw bytes rather than attempting to parse utf-8
    with open(filename, "rb") as file:
        file.seek(partsize * index)
        part = file.read(partsize)

    # Retry policy for when uploading a part fails
    s = requests.Session()
    retries = Retry(total=3, status_forcelist=[400, 500, 502, 503, 504])
    s.mount("https://", HTTPAdapter(max_retries=retries))

    return s.put(
        url,
        params={
            "action": "mpu-uploadpart",
            "uploadId": uploadId,
            "partNumber": str(index + 1),
        },
        data=part,
    ).json()


upload_file(worker_endpoint, filename, partsize)
```
