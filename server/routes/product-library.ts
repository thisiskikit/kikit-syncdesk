import express, { Router } from "express";
import type { Request } from "express";
import type { ProductLibraryRef, ProductLibraryStatus } from "@shared/product-library";
import {
  addProductLibraryAttachment,
  deleteProductLibraryAttachment,
  getProductLibraryAttachmentDownload,
  getProductLibraryRecord,
  getProductLibraryUploadLimitBytes,
  listProductLibraryRecords,
  upsertProductLibraryRecord,
} from "../services/product-library-service";
import { sendCreated, sendData, sendNormalizedError } from "../services/shared/api-response";

const router = Router();

function parsePositiveInteger(value: unknown, fallback: number, max?: number) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const normalized = Math.max(1, Math.floor(parsed));
  return typeof max === "number" ? Math.min(normalized, max) : normalized;
}

function readString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "bigint") {
    return String(value);
  }

  return "";
}

function readNullableString(value: unknown) {
  const normalized = readString(value).trim();
  return normalized ? normalized : null;
}

function buildReferenceFromUnknown(input: Record<string, unknown>): ProductLibraryRef {
  return {
    channel: readString(input.channel) as ProductLibraryRef["channel"],
    storeId: readString(input.storeId),
    channelProductId: readString(input.channelProductId),
    secondaryChannelProductId: readNullableString(input.secondaryChannelProductId),
    storeName: readString(input.storeName),
    productName: readString(input.productName),
    sellerProductCode: readNullableString(input.sellerProductCode),
  };
}

function isMultipartRequest(req: { headers: Request["headers"] }) {
  const contentType = req.headers["content-type"];
  const normalized = Array.isArray(contentType) ? contentType[0] : contentType;
  return typeof normalized === "string" && normalized.toLowerCase().startsWith("multipart/form-data");
}

const multipartUploadParser = express.raw({
  type: (req) => isMultipartRequest(req),
  limit: getProductLibraryUploadLimitBytes(),
});

async function parseMultipartFormData(req: Request) {
  const contentType = req.headers["content-type"];
  const normalizedContentType = Array.isArray(contentType) ? contentType[0] : contentType;

  if (!normalizedContentType || !normalizedContentType.toLowerCase().startsWith("multipart/form-data")) {
    throw new Error("multipart/form-data 요청만 업로드할 수 있습니다.");
  }

  const body =
    req.body instanceof Buffer
      ? req.body
      : Buffer.isBuffer(req.body)
        ? req.body
        : Buffer.from([]);

  const request = new Request("http://localhost/api/product-library/attachments", {
    method: "POST",
    headers: {
      "content-type": normalizedContentType,
    },
    body,
  });

  return request.formData();
}

router.get("/records", async (req, res) => {
  try {
    const result = await listProductLibraryRecords({
      channel: typeof req.query.channel === "string" ? req.query.channel : null,
      storeId: typeof req.query.storeId === "string" ? req.query.storeId : null,
      status: typeof req.query.status === "string" ? req.query.status : null,
      search: typeof req.query.search === "string" ? req.query.search : null,
      tag: typeof req.query.tag === "string" ? req.query.tag : null,
      page: parsePositiveInteger(req.query.page, 1),
      pageSize: parsePositiveInteger(req.query.pageSize, 50, 100),
    });

    sendData(res, result);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "PRODUCT_LIBRARY_LIST_FAILED",
      fallbackMessage: "자료실 목록을 불러오지 못했습니다.",
    });
  }
});

router.get("/record", async (req, res) => {
  try {
    const result = await getProductLibraryRecord(
      buildReferenceFromUnknown({
        channel: req.query.channel,
        storeId: req.query.storeId,
        channelProductId: req.query.channelProductId,
        secondaryChannelProductId: req.query.secondaryChannelProductId,
        storeName: req.query.storeName,
        productName: req.query.productName,
        sellerProductCode: req.query.sellerProductCode,
      }),
    );

    sendData(res, result);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "PRODUCT_LIBRARY_RECORD_FAILED",
      fallbackMessage: "자료실 상세를 불러오지 못했습니다.",
    });
  }
});

router.put("/record", async (req, res) => {
  try {
    const result = await upsertProductLibraryRecord({
      ...buildReferenceFromUnknown(req.body ?? {}),
      status: readString(req.body?.status) as ProductLibraryStatus,
      tags: Array.isArray(req.body?.tags) ? req.body.tags : [],
      memo: readString(req.body?.memo),
    });

    sendData(res, result);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "PRODUCT_LIBRARY_SAVE_FAILED",
      fallbackMessage: "자료실 저장에 실패했습니다.",
    });
  }
});

router.post("/attachments", multipartUploadParser, async (req, res) => {
  try {
    const formData = await parseMultipartFormData(req);
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new Error("업로드할 파일이 없습니다.");
    }

    const result = await addProductLibraryAttachment({
      reference: buildReferenceFromUnknown({
        channel: formData.get("channel"),
        storeId: formData.get("storeId"),
        channelProductId: formData.get("channelProductId"),
        secondaryChannelProductId: formData.get("secondaryChannelProductId"),
        storeName: formData.get("storeName"),
        productName: formData.get("productName"),
        sellerProductCode: formData.get("sellerProductCode"),
      }),
      file,
    });

    sendCreated(res, result);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "PRODUCT_LIBRARY_ATTACHMENT_UPLOAD_FAILED",
      fallbackMessage: "첨부 업로드에 실패했습니다.",
    });
  }
});

router.delete("/attachments/:attachmentId", async (req, res) => {
  try {
    const result = await deleteProductLibraryAttachment(req.params.attachmentId);
    sendData(res, result);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "PRODUCT_LIBRARY_ATTACHMENT_DELETE_FAILED",
      fallbackMessage: "첨부 삭제에 실패했습니다.",
    });
  }
});

router.get("/attachments/:attachmentId/download", async (req, res) => {
  try {
    const attachment = await getProductLibraryAttachmentDownload(req.params.attachmentId);
    res.setHeader("Content-Type", attachment.mimeType || "application/octet-stream");
    res.setHeader("Content-Length", String(attachment.byteSize));
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(attachment.fileName)}`,
    );
    res.end(attachment.binaryData);
  } catch (error) {
    sendNormalizedError(res, error, {
      fallbackCode: "PRODUCT_LIBRARY_ATTACHMENT_DOWNLOAD_FAILED",
      fallbackMessage: "첨부 다운로드에 실패했습니다.",
    });
  }
});

export default router;
