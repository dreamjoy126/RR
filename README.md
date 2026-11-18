# 資源教室雜支管理系統

React + Vite + Firebase 網站初版。

## 功能
- Email/Password 登入
- 角色：管理者 admin、承辦人 staff、查詢者 viewer
- 採購資料新增、編輯、刪除（刪除限管理者）
- 年度經費摘要、核銷狀態、用品照片／憑證上傳
- CSV 明細匯出
- Firestore 與 Storage 安全規則

## 本機啟動
1. 安裝 Node.js 20 或更新版本。
2. 複製 `.env.example` 為 `.env.local`，填入 Firebase Web App 六項設定。
3. 執行 `npm install`。
4. 執行 `npm run dev`。

## Firebase 必要設定
1. Authentication 已啟用 Email/Password。
2. 在 Firebase Console 建立 Cloud Firestore Database。
3. 建立 Firebase Storage bucket。
4. 使用 Firebase CLI 部署規則：`firebase deploy --only firestore:rules,storage`。
5. 部署網站：`npm run build` 後執行 `firebase deploy --only hosting`。

## 初始管理者
使用 Authentication 建立第一個帳號後，在 Firestore 建立文件：
- Collection：`users`
- Document ID：該帳號的 UID
- 欄位：`role` = `admin`、`displayName` = 使用者姓名

其他使用者建立相同格式文件，role 設為 `staff` 或 `viewer`。

## 注意
Firebase Web App config 是前端設定，不是管理員私密金鑰；真正資料安全由 Authentication 與 Security Rules 控制。尚未建立 Firestore 或 Storage 前，登入後資料功能無法正常使用。正式上線前請先完成規則部署並建立管理者帳號。
