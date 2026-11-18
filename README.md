# 資源教室雜支管理系統

React + Vite + Firebase 網站初版。

## 功能
- Email/Password 登入
- 角色：管理者 admin、承辦人 staff、查詢者 viewer
- 採購資料新增、編輯、刪除（刪除限管理者）
- 年度經費摘要、核銷狀態、用品用途與擺放／使用地點
- CSV 明細匯出
- 使用 Firestore 儲存雲端資料；本系統不使用 Firebase Storage，附件請以紙本或校內核准的既有方式留存

## 本機啟動
1. 安裝 Node.js 20 或更新版本。
2. 執行 `npm install`。
3. 執行 `npm run dev`。

## Firebase 設定
1. Authentication 啟用 Email/Password。
2. 建立 Cloud Firestore Database。
3. 在 Firebase Console 的 Firestore Rules 頁面，部署本專案的 `firestore.rules` 內容。
4. 本系統不需要啟用 Firebase Storage。

## 初始管理者
使用 Authentication 建立第一個帳號後，在 Firestore Console 手動建立文件：
- Collection：`users`
- Document ID：該帳號的 UID
- 欄位：`role` = `admin`、`displayName` = 使用者姓名

其他使用者建立相同格式文件，role 設為 `staff` 或 `viewer`。

## 重要安全提醒
Firebase Web App config 屬於前端公開設定，不是管理員私密金鑰。真正資料安全由 Authentication 與 Firestore Security Rules 控制。請勿將 Firestore Rules 設為允許所有人讀寫。正式多人使用前，請先部署安全規則並建立管理者角色文件。
