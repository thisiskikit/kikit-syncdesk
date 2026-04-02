type DataFieldRow = {
  field: string;
  meaning: string;
  source: string;
  status: string;
  note: string;
};

type OfficialReference = {
  manualNo: string;
  officialDocNo: string;
  title: string;
  endpoint: string;
  usage: string;
  detail: string;
  url: string;
};

const OFFICIAL_DOC_VERSION = "2.74.0";
const OFFICIAL_DOC_RELEASED_AT = "2026-03-17";

const currentListFields: DataFieldRow[] = [
  { field: "storeName", meaning: "연결된 NAVER 스토어 이름", source: "앱 로컬 설정", status: "현재 표시", note: "행 보조 정보로 표시" },
  { field: "productName", meaning: "상품명", source: "상품 목록 조회", status: "현재 표시", note: "목록의 대표 표시 값" },
  { field: "originProductNo", meaning: "원상품 번호", source: "상품 목록 조회", status: "현재 표시", note: "가격 반영과 메모 키에 사용" },
  { field: "channelProductNo", meaning: "채널 상품 번호", source: "상품 목록 조회", status: "현재 표시", note: "상세 조회 진입 키로 사용" },
  { field: "saleStatusCode / saleStatusLabel", meaning: "판매 상태 코드와 표시용 라벨", source: "상품 목록 조회 + 서버 매핑", status: "현재 표시", note: "SALE, WAIT, CLOSE 등" },
  { field: "displayStatusCode / displayStatusLabel", meaning: "전시 상태 코드와 표시용 라벨", source: "상품 목록 조회 + 서버 매핑", status: "현재 표시", note: "ON, WAIT, SUSPENSION 등" },
  { field: "salePrice", meaning: "현재 판매가", source: "상품 목록 조회", status: "현재 표시", note: "가격 변경의 기준값" },
  { field: "discountedPrice", meaning: "할인 반영가", source: "상품 목록 조회", status: "현재 표시", note: "판매가 아래 보조 행으로 표시" },
  { field: "deliveryFee", meaning: "기본 배송비", source: "상품 목록 조회", status: "현재 표시", note: "현재는 숫자 또는 무료 여부만 표시" },
  { field: "stockQuantity", meaning: "재고 수량", source: "상품 목록 조회", status: "현재 표시", note: "정렬 가능" },
  { field: "hasOptions", meaning: "옵션 상품 여부 요약값", source: "상품 목록 조회", status: "현재 표시", note: "목록에서는 단순 옵션 여부만 사용" },
  { field: "memo", meaning: "내부 운영 메모", source: "앱 로컬 메모 저장소", status: "현재 표시/편집", note: "NAVER 원본 데이터가 아님" },
  { field: "createdAt", meaning: "등록일", source: "상품 목록 조회", status: "현재 표시", note: "리스트용 메타 정보" },
  { field: "modifiedAt", meaning: "수정일", source: "상품 목록 조회", status: "현재 표시", note: "기본 정렬 기준" },
  { field: "channelServiceType", meaning: "채널 서비스 타입", source: "상품 목록 조회", status: "내부 보관", note: "응답 타입에는 있으나 화면 미노출" },
  { field: "categoryId", meaning: "카테고리 ID", source: "상품 목록 조회", status: "내부 보관", note: "추후 카테고리명 보강 가능" },
  { field: "sellerManagementCode", meaning: "판매자 관리 코드", source: "상품 목록 조회", status: "내부 보관", note: "운영용 컬럼으로 추가하기 쉬움" },
  { field: "saleStartDate / saleEndDate", meaning: "판매 시작/종료 일시", source: "상품 목록 조회", status: "내부 보관", note: "일정 제어 화면 확장 후보" },
];

const previewFields: DataFieldRow[] = [
  { field: "currentPrice", meaning: "실제 반영 직전 기준 현재 가격", source: "채널 상품 조회 또는 목록 fallback", status: "미리보기 사용", note: "입력값 검증의 기준값" },
  { field: "saleStatusCode / saleStatusLabel", meaning: "실제 업데이트 대상의 판매 상태", source: "채널 상품 조회 또는 목록 fallback", status: "미리보기 사용", note: "상태 확인용" },
  { field: "hasOptions", meaning: "옵션 존재 여부", source: "채널 상품 조회 또는 목록 fallback", status: "미리보기 사용", note: "옵션 가격 직접 수정은 아직 미지원" },
  { field: "optionType", meaning: "옵션 타입 요약", source: "원상품 detailAttribute.optionInfo", status: "미리보기 사용", note: "none, standard, combination, simple, custom, unknown" },
  { field: "optionCount", meaning: "옵션 또는 조합 개수", source: "원상품 detailAttribute.optionInfo", status: "미리보기 사용", note: "옵션 구조 확인용" },
  { field: "optionHandlingMessage", meaning: "이번 단계에서 무엇이 바뀌고 무엇이 안 바뀌는지 안내", source: "서버 생성값", status: "미리보기 사용", note: "운영자 실수 방지" },
  { field: "validationMessage", meaning: "업데이트 불가 사유", source: "서버 생성값", status: "미리보기 사용", note: "같은 가격, 비정상 가격, 조회 실패 등" },
  { field: "comparisonText", meaning: "현재가 -> 새 가격 비교 텍스트", source: "서버 생성값", status: "미리보기 사용", note: "대량 반영 전 확인용" },
];

const sampleSearchKeys: DataFieldRow[] = [
  { field: "originProductNo / channelProductNo", meaning: "원상품 번호 / 채널 상품 번호", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 구현에서 모두 사용 중" },
  { field: "channelServiceType", meaning: "채널 서비스 유형", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 미노출" },
  { field: "categoryId", meaning: "카테고리 ID", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "카테고리명 보강용 후보" },
  { field: "name", meaning: "상품명", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 productName으로 매핑" },
  { field: "sellerManagementCode", meaning: "판매자 관리 코드", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "운영 관리 컬럼 후보" },
  { field: "statusType", meaning: "판매 상태 코드", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 라벨로도 변환" },
  { field: "channelProductDisplayStatusType", meaning: "전시 상태 코드", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 라벨로도 변환" },
  { field: "salePrice / discountedPrice / mobileDiscountedPrice", meaning: "판매가 / 할인반영가 / 모바일 할인 반영가", source: "실제 /v1/products/search 응답 샘플", status: "부분 사용", note: "현재 mobileDiscountedPrice는 미사용" },
  { field: "stockQuantity", meaning: "재고 수량", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 사용 중" },
  { field: "knowledgeShoppingProductRegistration", meaning: "쇼핑 등록 관련 값", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 미사용" },
  { field: "deliveryAttributeType / deliveryFee", meaning: "배송 속성 / 기본 배송비", source: "실제 /v1/products/search 응답 샘플", status: "부분 사용", note: "deliveryFee는 사용 중, deliveryAttributeType은 미사용" },
  { field: "returnFee / exchangeFee", meaning: "반품비 / 교환비", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 미사용" },
  { field: "managerPurchasePoint", meaning: "관리용 구매 포인트 값", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 미사용" },
  { field: "wholeCategoryName / wholeCategoryId", meaning: "전체 카테고리명 / 전체 카테고리 경로 ID", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "카테고리 표시 개선 후보" },
  { field: "representativeImage", meaning: "대표 이미지", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "썸네일 컬럼 추가 가능" },
  { field: "brandName / manufacturerName", meaning: "브랜드명 / 제조사명", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 미사용" },
  { field: "regDate / modifiedDate", meaning: "등록일 / 수정일", source: "실제 /v1/products/search 응답 샘플", status: "확인됨", note: "현재 사용 중" },
];

const detailExpansionFields: DataFieldRow[] = [
  { field: "originProduct.detailContent", meaning: "상세 설명 HTML/본문", source: "원상품 정보 구조체 #025 / 원상품 조회 #035", status: "추가 수집 가능", note: "상품 상세 미리보기나 검수 화면에 유용" },
  { field: "originProduct.images.representativeImage.url", meaning: "대표 이미지 URL", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "목록 썸네일 컬럼 구현 가능" },
  { field: "originProduct.images.optionalImages[]", meaning: "추가 이미지 목록", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "상세 패널에 적합" },
  { field: "originProduct.deliveryInfo.deliveryType", meaning: "배송 방식", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "DELIVERY, DIRECT 등" },
  { field: "originProduct.deliveryInfo.deliveryAttributeType", meaning: "배송 속성 타입", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "NORMAL, TODAY, HOPE 등" },
  { field: "originProduct.deliveryInfo.deliveryFee.deliveryFeeType", meaning: "배송비 타입", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "FREE, CONDITIONAL_FREE, PAID 등" },
  { field: "originProduct.deliveryInfo.deliveryFee.baseFee", meaning: "기본 배송비", source: "원상품 정보 구조체 #025", status: "부분 사용", note: "목록에서는 숫자형 배송비만 사용 중" },
  { field: "originProduct.deliveryInfo.deliveryFee.freeConditionalAmount", meaning: "조건부 무료 기준 금액", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "조건부 무료 표시 구현 가능" },
  { field: "originProduct.deliveryInfo.deliveryFee.deliveryFeePayType", meaning: "선불/착불 결제 방식", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "COLLECT, PREPAID 등" },
  { field: "originProduct.deliveryInfo.deliveryFee.deliveryFeeByArea", meaning: "지역별 추가 배송비", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "제주/도서산간 추가비 표시에 유용" },
  { field: "originProduct.deliveryInfo.claimDeliveryInfo.returnDeliveryFee", meaning: "반품 배송비", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "목록 응답의 returnFee와 대조 가능" },
  { field: "originProduct.deliveryInfo.claimDeliveryInfo.exchangeDeliveryFee", meaning: "교환 배송비", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "목록 응답의 exchangeFee와 대조 가능" },
  { field: "originProduct.detailAttribute.naverShoppingSearchInfo", meaning: "검색 노출용 브랜드/모델/제조사 정보", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "brandName, manufacturerName, modelName 등" },
  { field: "originProduct.detailAttribute.optionInfo.optionStandards", meaning: "표준형 옵션 구조", source: "원상품 정보 구조체 #025", status: "부분 사용", note: "현재는 개수와 타입 정도만 사용" },
  { field: "originProduct.detailAttribute.optionInfo.optionCombinations", meaning: "조합형 옵션 구조", source: "원상품 정보 구조체 #025", status: "부분 사용", note: "옵션 상세 편집 기능 확장 가능" },
  { field: "originProduct.detailAttribute.seoInfo", meaning: "SEO 제목/메타/판매자 태그", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "마케팅/검색 노출 관리용" },
  { field: "originProduct.detailAttribute.productInfoProvidedNotice", meaning: "상품정보제공고시", source: "원상품 정보 구조체 #025 + 공식 문서 #078/#079", status: "추가 수집 가능", note: "고시 항목 검증 화면 구성 가능" },
  { field: "originProduct.detailAttribute.originAreaInfo", meaning: "원산지 상세 정보", source: "원상품 정보 구조체 #025 + 공식 문서 #070/#071", status: "추가 수집 가능", note: "원산지 코드명 해석 가능" },
  { field: "originProduct.customerBenefit.immediateDiscountPolicy", meaning: "즉시 할인 정책", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "정률/정액 할인 값, 기간 포함" },
  { field: "originProduct.customerBenefit.purchasePointPolicy", meaning: "구매 적립 포인트 정책", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "정률/정액 포인트 및 기간 포함" },
  { field: "originProduct.customerBenefit.reviewPointPolicy", meaning: "리뷰 포인트 정책", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "텍스트/포토/한달사용 리뷰 포인트 포함" },
  { field: "originProduct.customerBenefit.giftPolicy", meaning: "사은품 정책", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "사은품 내용 표시 가능" },
  { field: "originProduct.customerBenefit.multiPurchaseDiscountPolicy", meaning: "복수 구매 할인 정책", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "구매 수량/금액 조건 할인" },
  { field: "originProduct.customerBenefit.reservedDiscountPolicy", meaning: "예약 할인 정책", source: "원상품 정보 구조체 #025", status: "추가 수집 가능", note: "기간형 할인 운영에 유용" },
  { field: "smartstoreChannelProduct.channelProductName", meaning: "채널 전용 상품명", source: "스마트스토어 채널상품 정보 구조체 #026", status: "추가 수집 가능", note: "원상품명과 다른 채널 노출명을 확인 가능" },
  { field: "smartstoreChannelProduct.bbsSeq", meaning: "공지사항 게시글 일련번호", source: "스마트스토어 채널상품 정보 구조체 #026", status: "추가 수집 가능", note: "공지사항 연결 관리용" },
  { field: "smartstoreChannelProduct.storeKeepExclusiveProduct", meaning: "알림받기 동의 회원 전용 여부", source: "스마트스토어 채널상품 정보 구조체 #026", status: "추가 수집 가능", note: "회원 전용 상품 운영 확인" },
  { field: "smartstoreChannelProduct.naverShoppingRegistration", meaning: "네이버 쇼핑 등록 여부", source: "스마트스토어 채널상품 정보 구조체 #026", status: "추가 수집 가능", note: "노출 여부 검수용" },
  { field: "smartstoreChannelProduct.channelProductDisplayStatusType", meaning: "스마트스토어 채널 전시 상태", source: "스마트스토어 채널상품 정보 구조체 #026", status: "부분 사용", note: "목록에서는 라벨 수준으로만 사용 중" },
];

const officialReferences: OfficialReference[] = [
  { manualNo: "REF-001", officialDocNo: "051", title: "상품 목록 조회", endpoint: "POST /v1/products/search", usage: "현재 목록 화면의 핵심 데이터 소스", detail: "상품명, 상품번호, 상태, 판매가, 배송비, 재고, 카테고리 계열 요약값을 대량 조회할 때 사용합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/search-product" },
  { manualNo: "REF-002", officialDocNo: "025", title: "원상품 정보 구조체", endpoint: "Schema", usage: "상세 조회에서 어떤 필드를 읽을 수 있는지 정의", detail: "원상품 공통 속성, 배송 정보, 옵션 정보, 고시 정보, 혜택 정보, SEO/태그 정보까지 가장 폭넓게 정의합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/schemas/%EC%9B%90%EC%83%81%ED%92%88-%EC%A0%95%EB%B3%B4-%EA%B5%AC%EC%A1%B0%EC%B2%B4" },
  { manualNo: "REF-003", officialDocNo: "026", title: "스마트스토어 채널상품 정보 구조체", endpoint: "Schema", usage: "채널 전용 전시/노출 속성 확인", detail: "채널 전용 상품명, 전시 상태, 쇼핑 등록 여부, 회원 전용 여부 같은 스마트스토어 전용 값 확인에 사용합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/schemas/%EC%8A%A4%EB%A7%88%ED%8A%B8%EC%8A%A4%ED%86%A0%EC%96%B4-%EC%B1%84%EB%84%90%EC%83%81%ED%92%88-%EC%A0%95%EB%B3%B4-%EA%B5%AC%EC%A1%B0%EC%B2%B4" },
  { manualNo: "REF-004", officialDocNo: "032", title: "(v2) 채널 상품 조회", endpoint: "GET /v2/products/channel-products/:channelProductNo", usage: "현재 미리보기에서 우선 사용하는 상세 조회 API", detail: "채널 상품 번호 기준으로 originProduct와 smartstoreChannelProduct를 함께 확인할 수 있어 가장 실용적인 상세 조회 경로입니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/read-channel-product-1-product" },
  { manualNo: "REF-005", officialDocNo: "035", title: "(v2) 원상품 조회", endpoint: "GET /v2/products/origin-products/:originProductNo", usage: "원상품 단위 상세 확인용", detail: "채널 상품 번호 없이도 원상품 번호로 공통 속성을 상세 조회할 수 있습니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/read-origin-product-product" },
  { manualNo: "REF-006", officialDocNo: "076", title: "상품 벌크 업데이트", endpoint: "PUT /v1/products/origin-products/bulk-update", usage: "현재 가격 변경 반영 API", detail: "현재 프로그램은 이 벌크 업데이트 API를 사용해 원상품 판매가를 일괄 변경합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/bulk-update-origin-product-product" },
  { manualNo: "REF-007", officialDocNo: "068", title: "카테고리별 속성 조회", endpoint: "GET /v1/product-attributes/attributes", usage: "카테고리 속성 보강 후보", detail: "카테고리별 필수/선택 속성을 읽어서 검수 화면이나 수정 화면을 만들 때 유용합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-attribute-list-product" },
  { manualNo: "REF-008", officialDocNo: "067", title: "카테고리별 속성값 조회", endpoint: "GET /v1/product-attributes/attribute-values", usage: "속성값 코드명 보강 후보", detail: "속성 선택지, 속성값 ID, 범위형 속성의 보조 데이터 구성에 필요합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-attribute-value-list-product" },
  { manualNo: "REF-009", officialDocNo: "089", title: "카테고리 조회", endpoint: "GET /v1/categories/:categoryId", usage: "카테고리명 표시 보강 후보", detail: "현재 응답에 있는 categoryId를 사람이 읽는 카테고리 정보로 바꿀 때 유용합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-category-product" },
  { manualNo: "REF-010", officialDocNo: "081", title: "카테고리별 표준형 옵션 조회", endpoint: "GET /v1/categories/:categoryId/standard-options", usage: "표준형 옵션 해석/수정 후보", detail: "옵션 그룹과 값 구조를 표준형 기준으로 읽어 옵션 편집 화면 확장에 도움됩니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-standard-option-by-category-product" },
  { manualNo: "REF-011", officialDocNo: "095", title: "(v2) 판매 옵션 정보 조회", endpoint: "GET /v2/categories/:categoryId/option-guides", usage: "카테고리 맞춤 옵션 가이드 보강 후보", detail: "판매 옵션 가이드를 기반으로 수정 가능한 옵션 구조와 입력 기준을 정교하게 만들 수 있습니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-option-guides-by-category-id-product" },
  { manualNo: "REF-012", officialDocNo: "078", title: "상품정보제공고시 상품군 목록 조회", endpoint: "GET /v1/product-info-provided-notice-types", usage: "고시 분류 보강 후보", detail: "고시 분류 목록을 읽어 상품군별 필수 고시 항목 검증 UI를 만들 수 있습니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-all-product-info-provided-notice-type-vo-product" },
  { manualNo: "REF-013", officialDocNo: "079", title: "상품정보제공고시 상품군 단건 조회", endpoint: "GET /v1/product-info-provided-notice-types/:type", usage: "고시 항목 상세 보강 후보", detail: "선택한 상품군에 필요한 상세 고시 항목을 읽을 수 있습니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-product-info-provided-notice-type-vo-product" },
  { manualNo: "REF-014", officialDocNo: "070", title: "원산지 코드 정보 전체 조회", endpoint: "GET /v1/product-origin-areas", usage: "원산지 코드 해석 보강 후보", detail: "원산지 코드와 이름을 매핑해 운영자가 이해하기 쉽게 보여줄 수 있습니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-all-origin-area-list-product" },
  { manualNo: "REF-015", officialDocNo: "083", title: "제조사 조회", endpoint: "GET /v1/product-manufacturers", usage: "제조사 검색/보정 후보", detail: "제조사명을 공식 식별자 기준으로 보강할 때 사용할 수 있습니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-manufacturer-list-product" },
  { manualNo: "REF-016", officialDocNo: "020", title: "브랜드 조회", endpoint: "GET /v1/product-brands", usage: "브랜드 보강 후보", detail: "브랜드명/브랜드 ID 정합성 확인과 자동완성 보강에 적합합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-brand-list-product" },
  { manualNo: "REF-017", officialDocNo: "086", title: "카탈로그 단건 조회", endpoint: "GET /v1/catalogs/:modelId", usage: "카탈로그 연결 정보 보강 후보", detail: "모델/카탈로그 매칭 정보를 상세하게 확인하는 데 사용할 수 있습니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-model-product" },
  { manualNo: "REF-018", officialDocNo: "093", title: "(v2) 제한 태그 여부 조회", endpoint: "POST /v2/tags/restricted", usage: "태그 검수 보강 후보", detail: "상품 태그 입력 시 제한 태그 여부를 사전 검수하는 기능으로 확장할 수 있습니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/is-restrict-tags-product" },
  { manualNo: "REF-019", officialDocNo: "074", title: "상품 이미지 다건 등록", endpoint: "POST /v1/product-images/upload", usage: "이미지 수정/등록 기능 확장 후보", detail: "대표 이미지와 추가 이미지 변경 기능을 넣으려면 선행으로 필요한 API입니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/upload-product" },
  { manualNo: "REF-020", officialDocNo: "056/058/064", title: "배송/반품 보조 문서", endpoint: "배송 그룹/반품 택배사 조회", usage: "배송비 정책 상세 보강 후보", detail: "묶음배송 그룹, 지역별 배송 정책, 반품 택배사 우선순위/선택지 보강에 사용합니다.", url: "https://apicenter.commerce.naver.com/docs/commerce-api/current/get-delivery-bundle-group-list-product" },
];

function SectionTitle(props: { manualNo: string; title: string; description: string }) {
  return (
    <div className="guide-section-title">
      <div className="guide-badge-row">
        <span className="guide-badge strong">{props.manualNo}</span>
      </div>
      <h2>{props.title}</h2>
      <p>{props.description}</p>
    </div>
  );
}

function DataTable(props: { rows: DataFieldRow[] }) {
  return (
    <div className="guide-table-wrap">
      <table className="table guide-table">
        <thead>
          <tr>
            <th>필드</th>
            <th>설명</th>
            <th>출처</th>
            <th>현재 상태</th>
            <th>메모</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => (
            <tr key={`${row.field}-${row.source}`}>
              <td>
                <code>{row.field}</code>
              </td>
              <td>{row.meaning}</td>
              <td>{row.source}</td>
              <td>{row.status}</td>
              <td>{row.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function NaverGuidePage() {
  return (
    <div className="page">
      <div className="hero">
        <h1>NAVER 데이터 가이드</h1>
        <p>
          이 화면은 현재 프로그램이 NAVER 상품 API에서 무엇을 가져오고 있는지, 무엇을 더 가져올 수 있는지,
          그리고 어떤 공식 문서를 기준으로 확장해야 하는지를 한 번에 확인하기 위한 내부 운영 가이드입니다.
        </p>
      </div>

      <div className="card guide-overview">
        <div className="guide-badge-row">
          <span className="guide-badge strong">가이드 기준 버전</span>
          <span className="guide-badge">NAVER Commerce API v{OFFICIAL_DOC_VERSION}</span>
          <span className="guide-badge">공개일 {OFFICIAL_DOC_RELEASED_AT}</span>
          <span className="guide-badge">프로그램 내장 문서</span>
        </div>
        <div className="guide-grid two">
          <div className="guide-note">
            <strong>현재 프로그램 흐름</strong>
            <p>
              목록 화면은 <code>/v1/products/search</code>를 중심으로 동작하고, 가격 미리보기는{" "}
              <code>/v2/products/channel-products/:channelProductNo</code>를 우선 사용하며, 가격 반영은{" "}
              <code>/v1/products/origin-products/bulk-update</code>를 사용합니다.
            </p>
          </div>
          <div className="guide-note">
            <strong>문서 번호 읽는 법</strong>
            <p>
              이 페이지의 <code>MANUAL-xxx</code>는 내부 가이드 번호이고, <code>공식 문서 #051</code> 같은 표기는
              NAVER 공식 문서 사이드바 번호입니다.
            </p>
          </div>
        </div>
      </div>

      <div className="card guide-section">
        <SectionTitle manualNo="MANUAL-001" title="현재 프로그램이 이미 가져오고 있는 핵심 목록 데이터" description="현재 /products 화면에서 즉시 보이거나 내부 로직에서 이미 들고 있는 필드들입니다." />
        <DataTable rows={currentListFields} />
      </div>

      <div className="card guide-section">
        <SectionTitle manualNo="MANUAL-002" title="가격 미리보기와 반영 전에 추가로 확인하는 데이터" description="가격을 바꾸기 전에 상세 조회 또는 fallback 값으로 확인하는 데이터입니다. 옵션 구조와 검증 메시지가 여기에 포함됩니다." />
        <DataTable rows={previewFields} />
      </div>

      <div className="card guide-section">
        <SectionTitle manualNo="MANUAL-003" title="공식 문서 기준으로 추가 수집 가능한 상세 필드" description="현재는 아직 화면에 노출하지 않지만, 공식 문서상 바로 확장 가능한 필드들입니다. 특히 배송, 옵션, 혜택, SEO, 고시, 채널 전용 속성이 많습니다." />
        <DataTable rows={detailExpansionFields} />
      </div>

      <div className="card guide-section">
        <SectionTitle manualNo="MANUAL-004" title="실제 목록 응답 샘플에서 확인한 대표 키" description="현재 연동 기준 /v1/products/search의 channelProducts[] 응답에서 확인된 대표 키입니다. 공식 문서 외에 실제 응답 기준으로도 어떤 정보가 바로 들어오는지 빠르게 파악할 수 있습니다." />
        <DataTable rows={sampleSearchKeys} />
      </div>

      <div className="card guide-section">
        <SectionTitle manualNo="MANUAL-005" title="확장 우선순위 추천" description="운영 효율을 기준으로 보면 아래 항목부터 붙이는 것이 체감 효과가 큽니다." />
        <div className="guide-grid two">
          <div className="guide-note">
            <strong>1차 추천</strong>
            <p>
              카테고리명, 대표 이미지, 브랜드명, 제조사명, 반품비/교환비, 배송비 타입, 선불/착불 여부를 목록 또는 상세 패널에
              추가하면 운영자가 상품 상태를 훨씬 빠르게 판단할 수 있습니다.
            </p>
          </div>
          <div className="guide-note">
            <strong>2차 추천</strong>
            <p>
              옵션 상세 구조, 고시 정보, 태그 제한 검수, 혜택 정책, 원산지 코드명, SEO/검색 태그까지 붙이면 단순 가격 수정
              도구를 넘어서 상품 검수 도구로 확장할 수 있습니다.
            </p>
          </div>
        </div>
      </div>

      <div className="card guide-section">
        <SectionTitle manualNo="MANUAL-006" title="NAVER 공식 문서 레퍼런스" description="현재 구현과 바로 연결되는 공식 문서를 모아둔 인덱스입니다. 각 카드의 공식 문서 번호와 URL을 따라가면 원본 문서를 바로 열 수 있습니다." />
        <div className="guide-ref-grid">
          {officialReferences.map((reference) => (
            <div key={reference.manualNo} className="guide-ref-card">
              <div className="guide-badge-row">
                <span className="guide-badge strong">{reference.manualNo}</span>
                <span className="guide-badge">공식 문서 #{reference.officialDocNo}</span>
              </div>
              <h3>{reference.title}</h3>
              <div className="muted">
                <code>{reference.endpoint}</code>
              </div>
              <p>{reference.usage}</p>
              <div className="muted">{reference.detail}</div>
              <a className="guide-link" href={reference.url} target="_blank" rel="noreferrer">
                공식 문서 열기
              </a>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
