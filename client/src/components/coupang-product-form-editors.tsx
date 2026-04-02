import type {
  CoupangProductAttributeInput,
  CoupangProductContentGroupInput,
  CoupangProductImageInput,
  CoupangProductNoticeInput,
} from "@shared/coupang";

function buildNextArray<T>(items: T[], index: number, nextItem: T) {
  return items.map((item, itemIndex) => (itemIndex === index ? nextItem : item));
}

export function ImageListEditor(props: {
  title: string;
  items: CoupangProductImageInput[];
  onChange: (items: CoupangProductImageInput[]) => void;
}) {
  return (
    <div className="stack">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <strong>{props.title}</strong>
        <button
          className="button ghost"
          type="button"
          onClick={() =>
            props.onChange([
              ...props.items,
              {
                imageOrder: props.items.length + 1,
                imageType: "REPRESENTATION",
                cdnPath: "",
                vendorPath: "",
              },
            ])
          }
        >
          이미지 추가
        </button>
      </div>
      <div className="editor-array-grid">
        {props.items.map((item, index) => (
          <div key={`${item.imageOrder}:${index}`} className="editor-array-card">
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <strong>이미지 {index + 1}</strong>
              <button
                className="button ghost"
                type="button"
                onClick={() => props.onChange(props.items.filter((_, itemIndex) => itemIndex !== index))}
              >
                삭제
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>정렬 순서</span>
                <input
                  inputMode="numeric"
                  value={item.imageOrder}
                  onChange={(event) =>
                    props.onChange(
                      buildNextArray(props.items, index, {
                        ...item,
                        imageOrder: Number(event.target.value) || 0,
                      }),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>이미지 타입</span>
                <input
                  value={item.imageType ?? ""}
                  onChange={(event) =>
                    props.onChange(
                      buildNextArray(props.items, index, {
                        ...item,
                        imageType: event.target.value,
                      }),
                    )
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>CDN 경로</span>
              <input
                value={item.cdnPath ?? ""}
                onChange={(event) =>
                  props.onChange(
                    buildNextArray(props.items, index, {
                      ...item,
                      cdnPath: event.target.value,
                    }),
                  )
                }
              />
            </label>
            <label className="field">
              <span>Vendor 경로</span>
              <input
                value={item.vendorPath ?? ""}
                onChange={(event) =>
                  props.onChange(
                    buildNextArray(props.items, index, {
                      ...item,
                      vendorPath: event.target.value,
                    }),
                  )
                }
              />
            </label>
          </div>
        ))}
      </div>
      {!props.items.length ? <div className="preview-empty-box">등록된 이미지가 없습니다.</div> : null}
    </div>
  );
}

export function NoticeListEditor(props: {
  title: string;
  items: CoupangProductNoticeInput[];
  onChange: (items: CoupangProductNoticeInput[]) => void;
}) {
  return (
    <div className="stack">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <strong>{props.title}</strong>
        <button
          className="button ghost"
          type="button"
          onClick={() =>
            props.onChange([
              ...props.items,
              {
                noticeCategoryName: "",
                noticeCategoryDetailName: "",
                content: "",
              },
            ])
          }
        >
          고시 항목 추가
        </button>
      </div>
      <div className="editor-array-grid">
        {props.items.map((item, index) => (
          <div key={`${item.noticeCategoryName ?? "notice"}:${index}`} className="editor-array-card">
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <strong>고시 항목 {index + 1}</strong>
              <button
                className="button ghost"
                type="button"
                onClick={() => props.onChange(props.items.filter((_, itemIndex) => itemIndex !== index))}
              >
                삭제
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>고시 분류</span>
                <input
                  value={item.noticeCategoryName ?? ""}
                  onChange={(event) =>
                    props.onChange(
                      buildNextArray(props.items, index, {
                        ...item,
                        noticeCategoryName: event.target.value,
                      }),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>상세 항목명</span>
                <input
                  value={item.noticeCategoryDetailName ?? ""}
                  onChange={(event) =>
                    props.onChange(
                      buildNextArray(props.items, index, {
                        ...item,
                        noticeCategoryDetailName: event.target.value,
                      }),
                    )
                  }
                />
              </label>
            </div>
            <label className="field">
              <span>내용</span>
              <textarea
                rows={4}
                value={item.content ?? ""}
                onChange={(event) =>
                  props.onChange(
                    buildNextArray(props.items, index, {
                      ...item,
                      content: event.target.value,
                    }),
                  )
                }
              />
            </label>
          </div>
        ))}
      </div>
      {!props.items.length ? <div className="preview-empty-box">등록된 고시정보가 없습니다.</div> : null}
    </div>
  );
}

export function AttributeListEditor(props: {
  title: string;
  items: CoupangProductAttributeInput[];
  onChange: (items: CoupangProductAttributeInput[]) => void;
}) {
  return (
    <div className="stack">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <strong>{props.title}</strong>
        <button
          className="button ghost"
          type="button"
          onClick={() =>
            props.onChange([
              ...props.items,
              {
                attributeTypeName: "",
                attributeValueName: "",
                exposed: "EXPOSED",
                editable: true,
              },
            ])
          }
        >
          속성 추가
        </button>
      </div>
      <div className="editor-array-grid">
        {props.items.map((item, index) => (
          <div key={`${item.attributeTypeName ?? "attribute"}:${index}`} className="editor-array-card">
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <strong>속성 {index + 1}</strong>
              <button
                className="button ghost"
                type="button"
                onClick={() => props.onChange(props.items.filter((_, itemIndex) => itemIndex !== index))}
              >
                삭제
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                <span>속성명</span>
                <input
                  value={item.attributeTypeName ?? ""}
                  onChange={(event) =>
                    props.onChange(
                      buildNextArray(props.items, index, {
                        ...item,
                        attributeTypeName: event.target.value,
                      }),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>속성값</span>
                <input
                  value={item.attributeValueName ?? ""}
                  onChange={(event) =>
                    props.onChange(
                      buildNextArray(props.items, index, {
                        ...item,
                        attributeValueName: event.target.value,
                      }),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>노출 여부</span>
                <input
                  value={item.exposed ?? ""}
                  onChange={(event) =>
                    props.onChange(
                      buildNextArray(props.items, index, {
                        ...item,
                        exposed: event.target.value,
                      }),
                    )
                  }
                />
              </label>
              <label className="field">
                <span>수정 가능</span>
                <select
                  value={item.editable ? "true" : "false"}
                  onChange={(event) =>
                    props.onChange(
                      buildNextArray(props.items, index, {
                        ...item,
                        editable: event.target.value === "true",
                      }),
                    )
                  }
                >
                  <option value="true">true</option>
                  <option value="false">false</option>
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>
      {!props.items.length ? <div className="preview-empty-box">등록된 속성이 없습니다.</div> : null}
    </div>
  );
}

export function ContentGroupEditor(props: {
  title: string;
  items: CoupangProductContentGroupInput[];
  onChange: (items: CoupangProductContentGroupInput[]) => void;
}) {
  return (
    <div className="stack">
      <div className="toolbar" style={{ justifyContent: "space-between" }}>
        <strong>{props.title}</strong>
        <button
          className="button ghost"
          type="button"
          onClick={() =>
            props.onChange([
              ...props.items,
              {
                contentsType: "HTML",
                contentDetails: [{ detailType: "TEXT", content: "" }],
              },
            ])
          }
        >
          상세 그룹 추가
        </button>
      </div>
      <div className="stack">
        {props.items.map((group, groupIndex) => (
          <div key={`${group.contentsType ?? "group"}:${groupIndex}`} className="editor-array-card">
            <div className="toolbar" style={{ justifyContent: "space-between" }}>
              <strong>상세 그룹 {groupIndex + 1}</strong>
              <button
                className="button ghost"
                type="button"
                onClick={() => props.onChange(props.items.filter((_, index) => index !== groupIndex))}
              >
                삭제
              </button>
            </div>
            <label className="field">
              <span>그룹 타입</span>
              <input
                value={group.contentsType ?? ""}
                onChange={(event) =>
                  props.onChange(
                    buildNextArray(props.items, groupIndex, {
                      ...group,
                      contentsType: event.target.value,
                    }),
                  )
                }
              />
            </label>
            <div className="stack">
              {group.contentDetails.map((detail, detailIndex) => (
                <div key={`${detail.detailType ?? "detail"}:${detailIndex}`} className="detail-card">
                  <div className="toolbar" style={{ justifyContent: "space-between" }}>
                    <strong>내용 {detailIndex + 1}</strong>
                    <button
                      className="button ghost"
                      type="button"
                      onClick={() =>
                        props.onChange(
                          buildNextArray(props.items, groupIndex, {
                            ...group,
                            contentDetails: group.contentDetails.filter((_, index) => index !== detailIndex),
                          }),
                        )
                      }
                    >
                      삭제
                    </button>
                  </div>
                  <label className="field">
                    <span>상세 타입</span>
                    <input
                      value={detail.detailType ?? ""}
                      onChange={(event) =>
                        props.onChange(
                          buildNextArray(props.items, groupIndex, {
                            ...group,
                            contentDetails: buildNextArray(group.contentDetails, detailIndex, {
                              ...detail,
                              detailType: event.target.value,
                            }),
                          }),
                        )
                      }
                    />
                  </label>
                  <label className="field">
                    <span>내용</span>
                    <textarea
                      rows={6}
                      value={detail.content ?? ""}
                      onChange={(event) =>
                        props.onChange(
                          buildNextArray(props.items, groupIndex, {
                            ...group,
                            contentDetails: buildNextArray(group.contentDetails, detailIndex, {
                              ...detail,
                              content: event.target.value,
                            }),
                          }),
                        )
                      }
                    />
                  </label>
                </div>
              ))}
              <button
                className="button ghost"
                type="button"
                onClick={() =>
                  props.onChange(
                    buildNextArray(props.items, groupIndex, {
                      ...group,
                      contentDetails: [
                        ...group.contentDetails,
                        {
                          detailType: "TEXT",
                          content: "",
                        },
                      ],
                    }),
                  )
                }
              >
                내용 추가
              </button>
            </div>
          </div>
        ))}
      </div>
      {!props.items.length ? <div className="preview-empty-box">등록된 상세 설명이 없습니다.</div> : null}
    </div>
  );
}
