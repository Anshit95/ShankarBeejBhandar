# Shankar Beej Bhandar PWA

## Included
- Dashboard
- Distributor management
- Distributor bill history
- Distributor payment history
- Distributor complete history
- Bill photos
- Bill amount OCR
- Optional bill item details
- Automatic stock from bill items
- Manual stock adjustments
- Sales records
- 85-day sales cycle
- GST calculation from total amount
- GST calculation from sales date range
- Completed 85-day period history
- Browser notifications for completed 85-day periods
- Search
- Edit/delete records
- Export/import backup
- Full reset of shop records
- Mobile responsive design
- PWA install support
- Offline cache for app files

## Important
Shop records are stored in the browser's local storage on the device. The GitHub repository contains the app code, not the local shop records.

Export a JSON backup regularly. Bill photos are stored locally with the app data and can be lost if browser/site storage is cleared.

## GitHub Pages
1. Create a new repository.
2. Upload all files from this folder to the repository root.
3. Open Settings -> Pages.
4. Select Deploy from a branch.
5. Select `main` and `/ (root)`.
6. Save.
7. Open the generated Pages URL.
8. On Android Chrome use Menu -> Add to Home screen / Install app.

## OCR
The first OCR scan uses Tesseract.js from jsDelivr, so internet access is needed for OCR language resources. The detected amount should always be checked before saving.

## Data reset
Use More -> Reset All Data to start fresh. This removes distributors, bills, payments, stock adjustments and sales while keeping settings.
