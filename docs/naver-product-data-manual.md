# NAVER Product Data Manual

## Purpose

This document explains what data the current NAVER product screen can load, where each value comes from, and what is only displayed versus actually editable.

## Main List Screen

The product list screen loads data from `POST /v1/products/search` and combines it with locally stored memo data.

### Fields loaded and currently shown in the screen

| Field | Meaning | Source | Current usage |
| --- | --- | --- | --- |
| `storeName` | Connected NAVER store name | Local store settings | Shown in each row |
| `productName` | Product name | NAVER product search | Shown |
| `originProductNo` | NAVER origin product number | NAVER product search | Shown |
| `channelProductNo` | NAVER channel product number | NAVER product search | Shown |
| `saleStatusCode` | Raw sale status code | NAVER product search | Used internally |
| `saleStatusLabel` | Human-readable sale status | Mapped in server | Shown |
| `displayStatusCode` | Raw display status code | NAVER product search | Used internally |
| `displayStatusLabel` | Human-readable display status | Mapped in server | Shown |
| `salePrice` | Current sale price | NAVER product search | Shown |
| `discountedPrice` | Discount-applied price | NAVER product search | Shown under sale price |
| `deliveryFee` | Product delivery fee | NAVER product search | Shown under price |
| `stockQuantity` | Stock quantity | NAVER product search | Shown |
| `hasOptions` | Whether the product seems to have options | NAVER product search | Shown as option/non-option |
| `memo` | Internal memo | Local memo store, not NAVER | Shown and editable |
| `createdAt` | Product registration date | NAVER product search | Shown |
| `modifiedAt` | Last modified date | NAVER product search | Shown |

### Fields loaded but not currently shown in the main table

| Field | Meaning | Source | Note |
| --- | --- | --- | --- |
| `channelServiceType` | NAVER channel service type | NAVER product search | Stored in response only |
| `categoryId` | NAVER category id | NAVER product search | Stored in response only |
| `sellerManagementCode` | Seller management code | NAVER product search | Stored in response only |
| `saleStartDate` | Sale start date | NAVER product search | Stored in response only |
| `saleEndDate` | Sale end date | NAVER product search | Stored in response only |

## List Response Metadata

The list response also includes paging and loading metadata.

| Field | Meaning |
| --- | --- |
| `page` | Current page number |
| `size` | Page size |
| `totalElements` | Total items visible after local max-item limit is applied |
| `availableTotalElements` | Total items NAVER reported before local limit |
| `totalPages` | Total page count |
| `first` | Whether this is the first page |
| `last` | Whether this is the last page |
| `loadedCount` | Number of rows actually loaded in the response |
| `isTruncated` | Whether the current result is cut off before the full NAVER total |
| `appliedMaxItems` | Local max item cap applied by this app |
| `limitedByMaxItems` | Whether the app intentionally cut the list down |
| `fetchedAt` | Time when the response was built |
| `servedFromCache` | Whether the list came from local cache instead of a fresh NAVER call |

## Price Preview and Bulk Price Change

When the user selects products and runs price preview, the app loads additional data used for validation before updating price.

### Extra fields checked during preview

| Field | Meaning | Source |
| --- | --- | --- |
| `currentPrice` | Confirmed current price | NAVER detail or list fallback |
| `saleStatusCode` | Raw sale status | NAVER detail or list fallback |
| `saleStatusLabel` | Human-readable sale status | Server mapping |
| `hasOptions` | Whether options exist | NAVER detail or list fallback |
| `optionType` | Option structure type such as `none`, `combination`, `standard`, `simple`, `custom`, `unknown` | NAVER detail or list fallback |
| `optionCount` | Number of detected options or option combinations | NAVER detail when available |
| `optionHandlingMessage` | Guidance message describing what will or will not change | Server-generated |
| `modifiedAt` | Last modified date used in preview | NAVER detail or list fallback |
| `validationMessage` | Why a row cannot be updated yet | Server-generated |
| `comparisonText` | Current price to new price comparison | Server-generated |

### What the current bulk price feature actually changes

- It updates the base sale price only.
- It does not update option-specific price differences.
- It does not update delivery fee.
- It does not update stock quantity.
- It does not directly change sale status in the price update flow.

## Memo Data

Memo is not loaded from NAVER.

- Memo is stored in the app's local memo store by `storeId + originProductNo`.
- Memo is attached to list rows after the NAVER list response is normalized.
- Memo can be created, updated, and deleted inside the product screen.

## Delivery Fee Notes

- Delivery fee is now loaded from the NAVER product search response field `channelProducts[].deliveryFee`.
- In the current UI, `0` is shown as free delivery.
- If NAVER does not return a delivery fee, the UI shows `-`.
- The current app only displays delivery fee. It does not edit delivery fee yet.

## Current Limits

- Option information in the main list is a lightweight summary and may be incomplete.
- More precise option details are confirmed during preview when detail lookup is available.
- Some fields already exist in the response type but are not yet exposed in the table.
- If more fields are needed in the screen, the easiest next candidates are `sellerManagementCode`, `categoryId`, and sale period dates.

## Recommended Next Expansion Candidates

If you want to extend the screen later, these are already close to usable:

1. Show `sellerManagementCode` in the main table or detail panel.
2. Show `categoryId` or full category path.
3. Show `saleStartDate` and `saleEndDate`.
4. Show delivery fee type and pay type from detail lookup.
5. Add a separate detail panel for fields that are already in the response but not yet visible.
