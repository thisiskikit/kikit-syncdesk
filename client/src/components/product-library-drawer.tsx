import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { ProductLibraryRecord, ProductLibraryRef, ProductLibraryStatus } from "@shared/product-library";
import {
  PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES,
  productLibraryStatuses,
} from "@shared/product-library";
import {
  buildProductLibraryRecordQueryKey,
  buildProductLibraryRecordUrl,
  formatProductLibraryBytes,
  formatProductLibraryStatusLabel,
  getProductLibraryRemainingBytes,
  parseTagInput,
  stringifyTags,
} from "@/lib/product-library";
import { resolveApiUrl } from "@/lib/api-url";
import { apiRequestFormDataJson, apiRequestJson, getJson, queryClient } from "@/lib/queryClient";
import { formatDate } from "@/lib/utils";

type FeedbackState =
  | {
      type: "success" | "error";
      message: string;
    }
  | null;

function buildScaffold(reference: ProductLibraryRef): ProductLibraryRecord {
  return {
    id: null,
    exists: false,
    channel: reference.channel,
    storeId: reference.storeId,
    channelProductId: reference.channelProductId,
    secondaryChannelProductId: reference.secondaryChannelProductId,
    storeName: reference.storeName,
    productName: reference.productName,
    sellerProductCode: reference.sellerProductCode,
    status: "review_required",
    tags: [],
    memo: "",
    attachmentCount: 0,
    attachmentBytes: 0,
    attachments: [],
    lastActivityAt: null,
    createdAt: null,
    updatedAt: null,
  };
}

function getStatusTone(status: ProductLibraryStatus) {
  if (status === "done") {
    return "success";
  }

  if (status === "approval_delay" || status === "on_hold") {
    return "attention";
  }

  return "pending";
}

export function ProductLibraryDrawer(props: {
  open: boolean;
  reference: ProductLibraryRef | null;
  onClose: () => void;
  onRecordChanged?: (record: ProductLibraryRecord) => void;
}) {
  const [status, setStatus] = useState<ProductLibraryStatus>("review_required");
  const [tagsInput, setTagsInput] = useState("");
  const [memoDraft, setMemoDraft] = useState("");
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const recordQueryKey = props.reference
    ? buildProductLibraryRecordQueryKey(props.reference)
    : (["/api/product-library/record", "closed"] as const);

  const recordQuery = useQuery({
    queryKey: recordQueryKey,
    queryFn: () => {
      if (!props.reference) {
        throw new Error("자료실 대상 상품이 없습니다.");
      }

      return getJson<ProductLibraryRecord>(buildProductLibraryRecordUrl(props.reference));
    },
    enabled: props.open && Boolean(props.reference),
    staleTime: 5_000,
  });

  const activeRecord = useMemo(() => {
    if (recordQuery.data) {
      return recordQuery.data;
    }

    if (props.reference) {
      return buildScaffold(props.reference);
    }

    return null;
  }, [props.reference, recordQuery.data]);

  useEffect(() => {
    if (!activeRecord) {
      return;
    }

    setStatus(activeRecord.status);
    setTagsInput(stringifyTags(activeRecord.tags));
    setMemoDraft(activeRecord.memo);
  }, [activeRecord]);

  useEffect(() => {
    if (!props.open) {
      setFeedback(null);
    }
  }, [props.open]);

  const applyRecordUpdate = (record: ProductLibraryRecord) => {
    if (!props.reference) {
      return;
    }

    queryClient.setQueryData(recordQueryKey, record);
    void queryClient.invalidateQueries({ queryKey: ["/api/product-library/records"] });
    props.onRecordChanged?.(record);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!activeRecord) {
        throw new Error("자료실 대상 상품을 찾을 수 없습니다.");
      }

      return apiRequestJson<ProductLibraryRecord>("PUT", "/api/product-library/record", {
        channel: activeRecord.channel,
        storeId: activeRecord.storeId,
        channelProductId: activeRecord.channelProductId,
        secondaryChannelProductId: activeRecord.secondaryChannelProductId,
        storeName: activeRecord.storeName,
        productName: activeRecord.productName,
        sellerProductCode: activeRecord.sellerProductCode,
        status,
        tags: parseTagInput(tagsInput),
        memo: memoDraft,
      });
    },
    onSuccess: (record) => {
      applyRecordUpdate(record);
      setFeedback({
        type: "success",
        message: "자료실 내용을 저장했습니다.",
      });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "자료실 저장에 실패했습니다.",
      });
    },
  });

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!activeRecord) {
        throw new Error("자료실 대상 상품을 찾을 수 없습니다.");
      }

      const formData = new FormData();
      formData.set("channel", activeRecord.channel);
      formData.set("storeId", activeRecord.storeId);
      formData.set("channelProductId", activeRecord.channelProductId);
      formData.set("storeName", activeRecord.storeName);
      formData.set("productName", activeRecord.productName);

      if (activeRecord.secondaryChannelProductId) {
        formData.set("secondaryChannelProductId", activeRecord.secondaryChannelProductId);
      }

      if (activeRecord.sellerProductCode) {
        formData.set("sellerProductCode", activeRecord.sellerProductCode);
      }

      formData.set("file", file);

      return apiRequestFormDataJson<ProductLibraryRecord>(
        "POST",
        "/api/product-library/attachments",
        formData,
      );
    },
    onSuccess: (record) => {
      applyRecordUpdate(record);
      setFeedback({
        type: "success",
        message: "첨부파일을 업로드했습니다.",
      });

      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "첨부 업로드에 실패했습니다.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (attachmentId: string) =>
      apiRequestJson<ProductLibraryRecord>(
        "DELETE",
        `/api/product-library/attachments/${encodeURIComponent(attachmentId)}`,
      ),
    onSuccess: (record) => {
      applyRecordUpdate(record);
      setFeedback({
        type: "success",
        message: "첨부파일을 삭제했습니다.",
      });
    },
    onError: (error) => {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "첨부 삭제에 실패했습니다.",
      });
    },
  });

  if (!props.open || !props.reference) {
    return null;
  }

  const isBusy = saveMutation.isPending || uploadMutation.isPending || deleteMutation.isPending;
  const isUnavailable = recordQuery.isError;
  const remainingBytes = getProductLibraryRemainingBytes(activeRecord);
  const capacityText = `${formatProductLibraryBytes(activeRecord?.attachmentBytes ?? 0)} / ${formatProductLibraryBytes(PRODUCT_LIBRARY_MAX_ATTACHMENT_BYTES)}`;

  return (
    <div
      className="product-library-overlay"
      onMouseDown={() => {
        if (!isBusy) {
          props.onClose();
        }
      }}
    >
      <aside
        className="product-library-drawer"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="product-library-header">
          <div className="stack" style={{ gap: "0.35rem" }}>
            <div className="product-library-header-top">
              <h2 style={{ margin: 0 }}>자료실</h2>
              <button
                type="button"
                className="button ghost"
                onClick={props.onClose}
                disabled={isBusy}
              >
                닫기
              </button>
            </div>

            <div>
              <strong>{activeRecord?.productName ?? props.reference.productName}</strong>
            </div>
            <div className="muted">
              {props.reference.channel === "naver" ? "네이버" : "쿠팡"} / {props.reference.storeName}
            </div>
            <div className="product-library-meta-grid">
              <div>
                <span className="muted">상품 ID</span>
                <div>{props.reference.channelProductId}</div>
              </div>
              <div>
                <span className="muted">보조 ID</span>
                <div>{props.reference.secondaryChannelProductId ?? "-"}</div>
              </div>
              <div>
                <span className="muted">판매자 코드</span>
                <div>{props.reference.sellerProductCode ?? "-"}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="product-library-body">
          {feedback ? (
            <div className={`feedback ${feedback.type === "error" ? "error" : "success"}`}>
              {feedback.message}
            </div>
          ) : null}

          {recordQuery.isLoading ? <div className="empty">자료실을 불러오는 중입니다.</div> : null}
          {recordQuery.isError ? (
            <div className="feedback error">
              {recordQuery.error instanceof Error
                ? recordQuery.error.message
                : "자료실을 불러오지 못했습니다."}
            </div>
          ) : null}

          <div className="stack" style={{ gap: "0.9rem" }}>
            <div className="product-library-form-grid">
              <label className="stack" style={{ gap: "0.35rem" }}>
                <span>관리 상태</span>
                <select
                  value={status}
                  onChange={(event) => setStatus(event.target.value as ProductLibraryStatus)}
                  disabled={isBusy || isUnavailable}
                >
                  {productLibraryStatuses.map((item) => (
                    <option key={item} value={item}>
                      {formatProductLibraryStatusLabel(item)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="stack" style={{ gap: "0.35rem" }}>
                <span>태그</span>
                <input
                  value={tagsInput}
                  onChange={(event) => setTagsInput(event.target.value)}
                  placeholder="쉼표로 구분해서 입력"
                  disabled={isBusy || isUnavailable}
                />
              </label>
            </div>

            <div className="chip-row">
              <span className={`status-pill ${getStatusTone(status)}`}>
                {formatProductLibraryStatusLabel(status)}
              </span>
              {parseTagInput(tagsInput).map((tag) => (
                <span key={tag} className="chip">
                  #{tag}
                </span>
              ))}
            </div>

            <label className="stack" style={{ gap: "0.35rem" }}>
              <span>메인 메모</span>
              <textarea
                rows={10}
                value={memoDraft}
                onChange={(event) => setMemoDraft(event.target.value)}
                placeholder="심사 사유, 소명 진행 상황, 내부 메모를 남겨 주세요."
                disabled={isBusy || isUnavailable}
              />
            </label>

            <div className="product-library-attachments">
              <div className="card-header">
                <div className="stack" style={{ gap: "0.25rem" }}>
                  <strong>첨부파일</strong>
                  <div className="muted">
                    사용 용량 {capacityText}
                    {remainingBytes > 0 ? ` / 남은 용량 ${formatProductLibraryBytes(remainingBytes)}` : ""}
                  </div>
                </div>

                <div className="toolbar">
                  <input
                    ref={fileInputRef}
                    type="file"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) {
                        uploadMutation.mutate(file);
                      }
                    }}
                    disabled={isBusy || isUnavailable}
                  />
                </div>
              </div>

              {activeRecord?.attachments.length ? (
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>파일명</th>
                        <th>용량</th>
                        <th>등록일</th>
                        <th className="table-action-column">관리</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeRecord.attachments.map((attachment) => (
                        <tr key={attachment.id}>
                          <td>{attachment.fileName}</td>
                          <td>{formatProductLibraryBytes(attachment.byteSize)}</td>
                          <td>{formatDate(attachment.createdAt)}</td>
                          <td className="table-action-cell">
                            <div className="table-inline-actions">
                              <a
                                className="button ghost"
                                href={resolveApiUrl(attachment.downloadUrl)}
                                target="_blank"
                                rel="noreferrer"
                              >
                                다운로드
                              </a>
                              <button
                                type="button"
                                className="button ghost"
                                onClick={() => deleteMutation.mutate(attachment.id)}
                                disabled={isBusy || isUnavailable}
                              >
                                삭제
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty">등록된 첨부파일이 없습니다.</div>
              )}
            </div>

            <div className="muted">
              최근 활동 {activeRecord?.lastActivityAt ? formatDate(activeRecord.lastActivityAt) : "-"}
            </div>
          </div>
        </div>

        <div className="product-library-footer">
          <div className="muted">상품별 첨부 총용량은 최대 50MB입니다.</div>
          <button
            type="button"
            className="button"
            onClick={() => saveMutation.mutate()}
            disabled={isBusy || isUnavailable || recordQuery.isLoading}
          >
            {saveMutation.isPending ? "저장 중.." : "자료실 저장"}
          </button>
        </div>
      </aside>
    </div>
  );
}
