
# Adobe Subscription Lookup System

This is a Next.js application designed to look up Adobe subscription statuses from internal CSV data sources.

## Getting Started

First, install the dependencies:
```bash
npm install
# or
yarn
```

Then, run the development server:

```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:9002](http://localhost:9002) with your browser to see the result.

---

## Public API Usage

A versioned, public API endpoint is available to query all public information programmatically.

**Base URL**: `/api/v1/query`

### Authentication

All requests to the public API must be authenticated using a Bearer Token. The token is the password stored in the `public/apipwd.conf` file on the server.

The token must be sent in the `Authorization` header:

`Authorization: Bearer <your_password_from_apipwd.conf>`

### Endpoints

#### 1. Get User Count

- **Method**: `GET`
- **URL**: `/api/v1/query?type=count`
- **Description**: Returns the total number of users after applying any configured multipliers or additions from `user.conf`.
- **`cURL` Example**:
  ```sh
  curl "http://localhost:9002/api/v1/query?type=count" \
       -H "Authorization: Bearer your_password"
  ```
- **Success Response (200)**:
  ```json
  {
    "count": 520
  }
  ```

#### 2. Get Expired Accounts

- **Method**: `GET`
- **URL**: `/api/v1/query?type=expired`
- **Description**: Returns a list of accounts that are expired and still present in the main data sources, requiring manual action.
- **`cURL` Example**:
  ```sh
  curl "http://localhost:9002/api/v1/query?type=expired" \
       -H "Authorization: Bearer your_password"
  ```
- **Success Response (200)**:
  ```json
  {
    "expiredAccounts": [
      {
        "email": "expired@example.com",
        "organization": "parvis",
        "approver": "some.approver",
        "expirationDate": "20230101"
      }
    ]
  }
  ```

#### 3. Exact & Fuzzy User Search

- **Method**: `POST`
- **URL**: `/api/v1/query`
- **Headers**: 
  - `Content-Type: application/json`
  - `Authorization: Bearer your_password`
- **Description**: Performs a search for a user by email. The type of search is determined by the `type` field in the JSON body.
- **Body Parameters**:
  - `email` (string, required): The email address or prefix to search for.
  - `type` (string, required): The type of search. Must be either `"exact"` or `"fuzzy"`.

- **`cURL` Example (Exact Search)**:
  ```sh
  curl -X POST "http://localhost:9002/api/v1/query" \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer your_password" \
       -d '{"email": "user@example.com", "type": "exact"}'
  ```

- **`cURL` Example (Fuzzy Search)**:
  ```sh
  curl -X POST "http://localhost:9002/api/v1/query" \
       -H "Content-Type: application/json" \
       -H "Authorization: Bearer your_password" \
       -d '{"email": "user", "type": "fuzzy"}'
  ```

- **Success Response (200, Exact Search)**:
  ```json
  {
    "email": "user@example.com",
    "status": "Valid",
    "organization": "Parvis School of Economics and Music",
    "subscriptionDetails": "All Apps plan",
    "deviceLimit": 2,
    "approver": "-",
    "approvalDate": "-",
    "expirationDate": "Rolling"
  }
  ```
- **Success Response (200, Fuzzy Search)**:
  ```json
  {
      "message": "Potential matches found. Please enter a more specific or full email address for an exact search. / 找到潜在匹配项。请输入更完整或具体的邮箱地址以进行精确搜索。"
  }
  ```

- **Error Response (Fuzzy search term too short)**:
   ```json
  {
      "error": "Fuzzy search requires at least 3 characters. / 模糊搜索至少需要3个字符。"
  }
  ```
- **Error Response (Unauthorized)**:
   ```json
  {
    "error": "Unauthorized"
  }
  ```
