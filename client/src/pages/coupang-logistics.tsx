import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CoupangStoreSummary } from "@shared/coupang";
import type {
  CoupangCategoryListResponse,
  CoupangLogisticsCenterListResponse,
  CoupangLogisticsMutationResponse,
  CoupangOutboundCenterAddressInput,
  CoupangOutboundCenterRemoteInfoInput,
  CoupangOutboundCenterRow,
  CoupangReturnCenterAddressInput,
  CoupangReturnCenterRow,
} from "@shared/coupang-support";
import { StatusBadge } from "@/components/status-badge";
import { useOperations } from "@/components/operation-provider";
import { apiRequestJson, getJson } from "@/lib/queryClient";
import { useServerMenuState } from "@/lib/use-server-menu-state";
import { formatDate } from "@/lib/utils";

interface CoupangStoresResponse {
  items: CoupangStoreSummary[];
}

type PanelKey = "categories" | "outbound" | "returns";
type RegistrationType = "ALL" | "RFM";
type ToggleValue = "" | "true" | "false";

type FilterState = {
  selectedStoreId: string;
  registrationType: RegistrationType;
  query: string;
  panel: PanelKey;
  selectedOutboundId: string;
  selectedReturnId: string;
  operatorUserId: string;
};

type AddressDraft = {
  id: string;
  addressType: string;
  countryCode: string;
  companyContactNumber: string;
  phoneNumber2: string;
  returnZipCode: string;
  returnAddress: string;
  returnAddressDetail: string;
};

type RemoteInfoDraft = {
  id: string;
  remoteInfoId: string;
  deliveryCode: string;
  jeju: string;
  notJeju: string;
  usable: ToggleValue;
};

type OutboundFormState = {
  outboundShippingPlaceCode: string;
  shippingPlaceName: string;
  usable: ToggleValue;
  global: ToggleValue;
  placeAddresses: AddressDraft[];
  remoteInfos: RemoteInfoDraft[];
};

type ReturnFormState = {
  returnCenterCode: string;
  shippingPlaceName: string;
  usable: ToggleValue;
  placeAddresses: AddressDraft[];
  deliverCode: string;
  deliverName: string;
  contractNumber: string;
  contractCustomerNumber: string;
  vendorCreditFee02kg: string;
  vendorCreditFee05kg: string;
  vendorCreditFee10kg: string;
  vendorCreditFee20kg: string;
  vendorCashFee02kg: string;
  vendorCashFee05kg: string;
  vendorCashFee10kg: string;
  vendorCashFee20kg: string;
  consumerCashFee02kg: string;
  consumerCashFee05kg: string;
  consumerCashFee10kg: string;
  consumerCashFee20kg: string;
  returnFee02kg: string;
  returnFee05kg: string;
  returnFee10kg: string;
  returnFee20kg: string;
};

type FeedbackState =
  | {
      type: "success" | "warning" | "error";
      title: string;
      message: string;
    }
  | null;

const DEFAULT_FILTERS: FilterState = {
  selectedStoreId: "",
  registrationType: "ALL",
  query: "",
  panel: "categories",
  selectedOutboundId: "",
  selectedReturnId: "",
  operatorUserId: "",
};

function buildCategoriesUrl(filters: FilterState) {
  const params = new URLSearchParams({
    storeId: filters.selectedStoreId,
    registrationType: filters.registrationType,
  });

  if (filters.query.trim()) {
    params.set("query", filters.query.trim());
  }

  return `/api/coupang/logistics/categories?${params.toString()}`;
}

function buildOutboundCentersUrl(storeId: string) {
  return `/api/coupang/logistics/outbound-centers?storeId=${encodeURIComponent(storeId)}`;
}

function buildReturnCentersUrl(storeId: string) {
  return `/api/coupang/logistics/return-centers?storeId=${encodeURIComponent(storeId)}`;
}

function matchesText(values: Array<string | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  return values
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .includes(normalized);
}

function nextDraftId(prefix: string) {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

function emptyAddressDraft(): AddressDraft {
  return {
    id: nextDraftId("address"),
    addressType: "DOMESTIC",
    countryCode: "KR",
    companyContactNumber: "",
    phoneNumber2: "",
    returnZipCode: "",
    returnAddress: "",
    returnAddressDetail: "",
  };
}

function emptyRemoteInfoDraft(): RemoteInfoDraft {
  return {
    id: nextDraftId("remote"),
    remoteInfoId: "",
    deliveryCode: "",
    jeju: "",
    notJeju: "",
    usable: "",
  };
}

function defaultOutboundForm(): OutboundFormState {
  return {
    outboundShippingPlaceCode: "",
    shippingPlaceName: "",
    usable: "true",
    global: "",
    placeAddresses: [emptyAddressDraft()],
    remoteInfos: [emptyRemoteInfoDraft()],
  };
}

function defaultReturnForm(): ReturnFormState {
  return {
    returnCenterCode: "",
    shippingPlaceName: "",
    usable: "",
    placeAddresses: [emptyAddressDraft()],
    deliverCode: "",
    deliverName: "",
    contractNumber: "",
    contractCustomerNumber: "",
    vendorCreditFee02kg: "",
    vendorCreditFee05kg: "",
    vendorCreditFee10kg: "",
    vendorCreditFee20kg: "",
    vendorCashFee02kg: "",
    vendorCashFee05kg: "",
    vendorCashFee10kg: "",
    vendorCashFee20kg: "",
    consumerCashFee02kg: "",
    consumerCashFee05kg: "",
    consumerCashFee10kg: "",
    consumerCashFee20kg: "",
    returnFee02kg: "",
    returnFee05kg: "",
    returnFee10kg: "",
    returnFee20kg: "",
  };
}

function toToggleValue(value: boolean | null | undefined): ToggleValue {
  if (value === true) {
    return "true";
  }
  if (value === false) {
    return "false";
  }
  return "";
}

function toTextValue(value: string | number | null | undefined) {
  return value === null || value === undefined ? "" : String(value);
}

function mapOutboundRowToForm(row: CoupangOutboundCenterRow): OutboundFormState {
  return {
    outboundShippingPlaceCode: row.outboundShippingPlaceCode,
    shippingPlaceName: row.shippingPlaceName,
    usable: toToggleValue(row.usable),
    global: toToggleValue(row.global),
    placeAddresses: row.placeAddresses.length
      ? row.placeAddresses.map((address) => ({
          id: nextDraftId("address"),
          addressType: address.addressType ?? "DOMESTIC",
          countryCode: address.countryCode ?? "KR",
          companyContactNumber: address.companyContactNumber ?? "",
          phoneNumber2: address.phoneNumber2 ?? "",
          returnZipCode: address.returnZipCode ?? row.zipCode ?? "",
          returnAddress: address.returnAddress ?? row.address ?? "",
          returnAddressDetail: address.returnAddressDetail ?? row.addressDetail ?? "",
        }))
      : [
          {
            id: nextDraftId("address"),
            addressType: row.addressType ?? "DOMESTIC",
            countryCode: row.countryCode ?? "KR",
            companyContactNumber: row.companyContactNumber ?? "",
            phoneNumber2: row.phoneNumber2 ?? "",
            returnZipCode: row.zipCode ?? "",
            returnAddress: row.address ?? "",
            returnAddressDetail: row.addressDetail ?? "",
          },
        ],
    remoteInfos: (row.remoteInfos.length
      ? row.remoteInfos
      : [{ remoteInfoId: null, deliveryCode: null, jeju: null, notJeju: null, usable: null }]).map((item) => ({
      id: nextDraftId("remote"),
      remoteInfoId: item.remoteInfoId ?? "",
      deliveryCode: item.deliveryCode ?? "",
      jeju: toTextValue(item.jeju),
      notJeju: toTextValue(item.notJeju),
      usable: toToggleValue(item.usable),
    })),
  };
}

function mapReturnRowToForm(row: CoupangReturnCenterRow): ReturnFormState {
  return {
    returnCenterCode: row.returnCenterCode,
    shippingPlaceName: row.shippingPlaceName,
    usable: toToggleValue(row.usable),
    placeAddresses: row.placeAddresses.length
      ? row.placeAddresses.map((address) => ({
          id: nextDraftId("address"),
          addressType: address.addressType ?? row.addressType ?? "DOMESTIC",
          countryCode: address.countryCode ?? row.countryCode ?? "KR",
          companyContactNumber: address.companyContactNumber ?? row.companyContactNumber ?? "",
          phoneNumber2: address.phoneNumber2 ?? row.phoneNumber2 ?? "",
          returnZipCode: address.returnZipCode ?? row.zipCode ?? "",
          returnAddress: address.returnAddress ?? row.address ?? "",
          returnAddressDetail: address.returnAddressDetail ?? row.addressDetail ?? "",
        }))
      : [
          {
            id: nextDraftId("address"),
            addressType: row.addressType ?? "DOMESTIC",
            countryCode: row.countryCode ?? "KR",
            companyContactNumber: row.companyContactNumber ?? "",
            phoneNumber2: row.phoneNumber2 ?? "",
            returnZipCode: row.zipCode ?? "",
            returnAddress: row.address ?? "",
            returnAddressDetail: row.addressDetail ?? "",
          },
        ],
    deliverCode: row.deliverCode ?? "",
    deliverName: row.deliverName ?? "",
    contractNumber: "",
    contractCustomerNumber: "",
    vendorCreditFee02kg: toTextValue(row.vendorCreditFee02kg),
    vendorCreditFee05kg: toTextValue(row.vendorCreditFee05kg),
    vendorCreditFee10kg: toTextValue(row.vendorCreditFee10kg),
    vendorCreditFee20kg: toTextValue(row.vendorCreditFee20kg),
    vendorCashFee02kg: toTextValue(row.vendorCashFee02kg),
    vendorCashFee05kg: toTextValue(row.vendorCashFee05kg),
    vendorCashFee10kg: toTextValue(row.vendorCashFee10kg),
    vendorCashFee20kg: toTextValue(row.vendorCashFee20kg),
    consumerCashFee02kg: toTextValue(row.consumerCashFee02kg),
    consumerCashFee05kg: toTextValue(row.consumerCashFee05kg),
    consumerCashFee10kg: toTextValue(row.consumerCashFee10kg),
    consumerCashFee20kg: toTextValue(row.consumerCashFee20kg),
    returnFee02kg: toTextValue(row.returnFee02kg),
    returnFee05kg: toTextValue(row.returnFee05kg),
    returnFee10kg: toTextValue(row.returnFee10kg),
    returnFee20kg: toTextValue(row.returnFee20kg),
  };
}

function toOptionalBoolean(value: ToggleValue) {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return null;
}

function toOptionalNumber(value: string) {
  const normalized = value.replaceAll(",", "").trim();
  if (!normalized) {
    return null;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function buildOutboundAddressInput(addresses: AddressDraft[]) {
  return addresses.map(
    (address) =>
      ({
        addressType: address.addressType.trim(),
        countryCode: address.countryCode.trim(),
        companyContactNumber: address.companyContactNumber.trim(),
        phoneNumber2: address.phoneNumber2.trim() || null,
        returnZipCode: address.returnZipCode.trim(),
        returnAddress: address.returnAddress.trim(),
        returnAddressDetail: address.returnAddressDetail.trim(),
      }) satisfies CoupangOutboundCenterAddressInput,
  );
}

function buildRemoteInfoInput(remoteInfos: RemoteInfoDraft[]) {
  return remoteInfos
    .filter((item) => item.deliveryCode.trim())
    .map((item) => {
      const jeju = toOptionalNumber(item.jeju);
      const notJeju = toOptionalNumber(item.notJeju);

      return {
        remoteInfoId: item.remoteInfoId.trim() || null,
        deliveryCode: item.deliveryCode.trim(),
        jeju: Number.isNaN(jeju) ? 0 : jeju ?? 0,
        notJeju: Number.isNaN(notJeju) ? 0 : notJeju ?? 0,
        usable: toOptionalBoolean(item.usable),
      } satisfies CoupangOutboundCenterRemoteInfoInput;
    });
}

function buildReturnAddressInput(addresses: AddressDraft[]) {
  return addresses.map(
    (address) =>
      ({
        addressType: address.addressType.trim(),
        countryCode: address.countryCode.trim(),
        companyContactNumber: address.companyContactNumber.trim(),
        phoneNumber2: address.phoneNumber2.trim() || null,
        returnZipCode: address.returnZipCode.trim(),
        returnAddress: address.returnAddress.trim(),
        returnAddressDetail: address.returnAddressDetail.trim(),
      }) satisfies CoupangReturnCenterAddressInput,
  );
}

type ReturnFeeFieldKey =
  | "vendorCreditFee02kg"
  | "vendorCreditFee05kg"
  | "vendorCreditFee10kg"
  | "vendorCreditFee20kg"
  | "vendorCashFee02kg"
  | "vendorCashFee05kg"
  | "vendorCashFee10kg"
  | "vendorCashFee20kg"
  | "consumerCashFee02kg"
  | "consumerCashFee05kg"
  | "consumerCashFee10kg"
  | "consumerCashFee20kg"
  | "returnFee02kg"
  | "returnFee05kg"
  | "returnFee10kg"
  | "returnFee20kg";

function FeeFields(props: {
  form: ReturnFormState;
  onChange: (key: ReturnFeeFieldKey, value: string) => void;
}) {
  const fields: Array<{ key: ReturnFeeFieldKey; label: string }> = [
    { key: "vendorCreditFee02kg", label: "판매자 선불 02kg" },
    { key: "vendorCreditFee05kg", label: "판매자 선불 05kg" },
    { key: "vendorCreditFee10kg", label: "판매자 선불 10kg" },
    { key: "vendorCreditFee20kg", label: "판매자 선불 20kg" },
    { key: "vendorCashFee02kg", label: "판매자 착불 02kg" },
    { key: "vendorCashFee05kg", label: "판매자 착불 05kg" },
    { key: "vendorCashFee10kg", label: "판매자 착불 10kg" },
    { key: "vendorCashFee20kg", label: "판매자 착불 20kg" },
    { key: "consumerCashFee02kg", label: "고객 착불 02kg" },
    { key: "consumerCashFee05kg", label: "고객 착불 05kg" },
    { key: "consumerCashFee10kg", label: "고객 착불 10kg" },
    { key: "consumerCashFee20kg", label: "고객 착불 20kg" },
    { key: "returnFee02kg", label: "반품비 02kg" },
    { key: "returnFee05kg", label: "반품비 05kg" },
    { key: "returnFee10kg", label: "반품비 10kg" },
    { key: "returnFee20kg", label: "반품비 20kg" },
  ];

  return (
    <div className="form-grid">
      {fields.map((field) => (
        <label key={field.key} className="field">
          <span>{field.label}</span>
          <input
            inputMode="numeric"
            value={props.form[field.key]}
            onChange={(event) => props.onChange(field.key, event.target.value)}
          />
        </label>
      ))}
    </div>
  );
}

export default function CoupangLogisticsPage() {
  const {
    startLocalOperation,
    finishLocalOperation,
    removeLocalOperation,
    publishOperation,
  } = useOperations();
  const { state: filters, setState: setFilters, isLoaded: isFiltersLoaded } = useServerMenuState(
    "coupang.logistics",
    DEFAULT_FILTERS,
  );
  const [outboundForm, setOutboundForm] = useState<OutboundFormState>(defaultOutboundForm);
  const [returnForm, setReturnForm] = useState<ReturnFormState>(defaultReturnForm);
  const [feedback, setFeedback] = useState<FeedbackState>(null);
  const [isSaving, setIsSaving] = useState<null | "outbound" | "return">(null);

  const storesQuery = useQuery({
    queryKey: ["/api/coupang/stores"],
    queryFn: () => getJson<CoupangStoresResponse>("/api/coupang/stores"),
  });

  const stores = storesQuery.data?.items ?? [];

  useEffect(() => {
    if (!isFiltersLoaded || filters.selectedStoreId || !stores[0]) {
      return;
    }

    setFilters((current) => ({
      ...current,
      selectedStoreId: stores[0].id,
    }));
  }, [filters.selectedStoreId, isFiltersLoaded, setFilters, stores]);

  const categoriesQuery = useQuery({
    queryKey: [
      "/api/coupang/logistics/categories",
      filters.selectedStoreId,
      filters.registrationType,
      filters.query,
    ],
    queryFn: () => getJson<CoupangCategoryListResponse>(buildCategoriesUrl(filters)),
    enabled: Boolean(filters.selectedStoreId),
  });

  const outboundCentersQuery = useQuery({
    queryKey: ["/api/coupang/logistics/outbound-centers", filters.selectedStoreId],
    queryFn: () =>
      getJson<CoupangLogisticsCenterListResponse<CoupangOutboundCenterRow>>(
        buildOutboundCentersUrl(filters.selectedStoreId),
      ),
    enabled: Boolean(filters.selectedStoreId),
  });

  const returnCentersQuery = useQuery({
    queryKey: ["/api/coupang/logistics/return-centers", filters.selectedStoreId],
    queryFn: () =>
      getJson<CoupangLogisticsCenterListResponse<CoupangReturnCenterRow>>(
        buildReturnCentersUrl(filters.selectedStoreId),
      ),
    enabled: Boolean(filters.selectedStoreId),
  });

  const outboundRows = useMemo(
    () =>
      (outboundCentersQuery.data?.items ?? []).filter((row) =>
        matchesText(
          [row.outboundShippingPlaceCode, row.shippingPlaceName, row.address, row.addressDetail],
          filters.query,
        ),
      ),
    [filters.query, outboundCentersQuery.data?.items],
  );

  const returnRows = useMemo(
    () =>
      (returnCentersQuery.data?.items ?? []).filter((row) =>
        matchesText(
          [row.returnCenterCode, row.shippingPlaceName, row.deliverCode, row.address, row.addressDetail],
          filters.query,
        ),
      ),
    [filters.query, returnCentersQuery.data?.items],
  );

  const selectedOutboundRow = useMemo(
    () => outboundRows.find((row) => row.id === filters.selectedOutboundId) ?? null,
    [filters.selectedOutboundId, outboundRows],
  );
  const selectedReturnRow = useMemo(
    () => returnRows.find((row) => row.id === filters.selectedReturnId) ?? null,
    [filters.selectedReturnId, returnRows],
  );

  useEffect(() => {
    if (!selectedOutboundRow) {
      return;
    }

    setOutboundForm(mapOutboundRowToForm(selectedOutboundRow));
  }, [selectedOutboundRow]);

  useEffect(() => {
    if (!selectedReturnRow) {
      return;
    }

    setReturnForm(mapReturnRowToForm(selectedReturnRow));
  }, [selectedReturnRow]);

  const liveCategory = categoriesQuery.data?.source === "live";
  const liveOutbound = outboundCentersQuery.data?.source === "live";
  const liveReturns = returnCentersQuery.data?.source === "live";

  async function runMutation<T extends CoupangLogisticsMutationResponse>(input: {
    target: "outbound" | "return";
    title: string;
    request: () => Promise<T>;
    onSuccess: (result: T) => Promise<void>;
  }) {
    const toastId = startLocalOperation({
      channel: "coupang",
      actionName: input.title,
      targetCount: 1,
    });

    setIsSaving(input.target);
    setFeedback(null);

    try {
      const result = await input.request();
      if (result.operation) {
        publishOperation(result.operation);
      }
      await input.onSuccess(result);
      setFeedback({
        type: "success",
        title: "저장 완료",
        message: result.message,
      });
      finishLocalOperation(toastId, {
        status: "success",
        summary: result.message,
      });
      window.setTimeout(() => removeLocalOperation(toastId), 1_000);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "쿠팡 물류센터 저장 중 오류가 발생했습니다.";
      setFeedback({
        type: "error",
        title: "저장 실패",
        message,
      });
      finishLocalOperation(toastId, {
        status: "error",
        errorMessage: message,
      });
    } finally {
      setIsSaving(null);
    }
  }

  async function submitOutbound() {
    if (!filters.selectedStoreId) {
      return;
    }

    const userId = filters.operatorUserId.trim();
    if (!userId) {
      setFeedback({
        type: "warning",
        title: "작업자 ID 필요",
        message: "출고지 저장에는 작업자 ID가 필요합니다.",
      });
      return;
    }

    const placeAddresses = buildOutboundAddressInput(outboundForm.placeAddresses);
    if (!outboundForm.shippingPlaceName.trim() || !placeAddresses.length) {
      setFeedback({
        type: "warning",
        title: "필수값 확인",
        message: "출고지명과 최소 1개의 주소 정보를 입력해 주세요.",
      });
      return;
    }

    await runMutation({
      target: "outbound",
      title: outboundForm.outboundShippingPlaceCode
        ? "COUPANG 출고지 수정"
        : "COUPANG 출고지 생성",
      request: () => {
        const payload = {
          storeId: filters.selectedStoreId,
          userId,
          shippingPlaceName: outboundForm.shippingPlaceName.trim(),
          usable: toOptionalBoolean(outboundForm.usable),
          global: toOptionalBoolean(outboundForm.global),
          placeAddresses,
          remoteInfos: buildRemoteInfoInput(outboundForm.remoteInfos),
        };

        return outboundForm.outboundShippingPlaceCode
          ? apiRequestJson<CoupangLogisticsMutationResponse>(
              "PUT",
              `/api/coupang/logistics/outbound-centers/${encodeURIComponent(outboundForm.outboundShippingPlaceCode)}`,
              payload,
            )
          : apiRequestJson<CoupangLogisticsMutationResponse>(
              "POST",
              "/api/coupang/logistics/outbound-centers",
              payload,
            );
      },
      onSuccess: async () => {
        await outboundCentersQuery.refetch();
      },
    });
  }

  async function submitReturn() {
    if (!filters.selectedStoreId) {
      return;
    }

    const userId = filters.operatorUserId.trim();
    if (!userId) {
      setFeedback({
        type: "warning",
        title: "작업자 ID 필요",
        message: "반품지 저장에는 작업자 ID가 필요합니다.",
      });
      return;
    }

    const placeAddresses = buildReturnAddressInput(returnForm.placeAddresses);
    if (!placeAddresses.length) {
      setFeedback({
        type: "warning",
        title: "필수값 확인",
        message: "최소 1개의 반품 주소를 입력해 주세요.",
      });
      return;
    }

    const payload = {
      storeId: filters.selectedStoreId,
      userId,
      shippingPlaceName: returnForm.shippingPlaceName.trim() || null,
      usable: toOptionalBoolean(returnForm.usable),
      placeAddresses,
      goodsflowInfo: {
        deliverCode: returnForm.deliverCode.trim() || null,
        deliverName: returnForm.deliverName.trim() || null,
        contractNumber: returnForm.contractNumber.trim() || null,
        contractCustomerNumber: returnForm.contractCustomerNumber.trim() || null,
        vendorCreditFee02kg: toOptionalNumber(returnForm.vendorCreditFee02kg),
        vendorCreditFee05kg: toOptionalNumber(returnForm.vendorCreditFee05kg),
        vendorCreditFee10kg: toOptionalNumber(returnForm.vendorCreditFee10kg),
        vendorCreditFee20kg: toOptionalNumber(returnForm.vendorCreditFee20kg),
        vendorCashFee02kg: toOptionalNumber(returnForm.vendorCashFee02kg),
        vendorCashFee05kg: toOptionalNumber(returnForm.vendorCashFee05kg),
        vendorCashFee10kg: toOptionalNumber(returnForm.vendorCashFee10kg),
        vendorCashFee20kg: toOptionalNumber(returnForm.vendorCashFee20kg),
        consumerCashFee02kg: toOptionalNumber(returnForm.consumerCashFee02kg),
        consumerCashFee05kg: toOptionalNumber(returnForm.consumerCashFee05kg),
        consumerCashFee10kg: toOptionalNumber(returnForm.consumerCashFee10kg),
        consumerCashFee20kg: toOptionalNumber(returnForm.consumerCashFee20kg),
        returnFee02kg: toOptionalNumber(returnForm.returnFee02kg),
        returnFee05kg: toOptionalNumber(returnForm.returnFee05kg),
        returnFee10kg: toOptionalNumber(returnForm.returnFee10kg),
        returnFee20kg: toOptionalNumber(returnForm.returnFee20kg),
      },
    };

    await runMutation({
      target: "return",
      title: returnForm.returnCenterCode ? "COUPANG 반품지 수정" : "COUPANG 반품지 생성",
      request: () =>
        returnForm.returnCenterCode
          ? apiRequestJson<CoupangLogisticsMutationResponse>(
              "PUT",
              `/api/coupang/logistics/return-centers/${encodeURIComponent(returnForm.returnCenterCode)}`,
              payload,
            )
          : apiRequestJson<CoupangLogisticsMutationResponse>(
              "POST",
              "/api/coupang/logistics/return-centers",
              payload,
            ),
      onSuccess: async () => {
        await returnCentersQuery.refetch();
      },
    });
  }

  const categoryCount = categoriesQuery.data?.items.length ?? 0;
  const outboundCount = outboundCentersQuery.data?.items.length ?? 0;
  const returnCount = returnCentersQuery.data?.items.length ?? 0;

  return (
    <div className="page">
      <div className="hero">
        <div className="hero-badges">
          <StatusBadge tone={liveCategory || liveOutbound || liveReturns ? "live" : "draft"} />
          <StatusBadge tone="shared" label="쓰기 액션 포함" />
        </div>
        <h1>COUPANG 카테고리 / 물류센터</h1>
        <p>
          카테고리 조회와 함께 출고지, 반품지를 실연동으로 생성하고 수정합니다. 조회 목록에서 센터를
          선택하면 우측 편집 카드에 현재 값이 채워집니다.
        </p>
      </div>

      <div className="card">
        <div className="toolbar">
          <select
            value={filters.selectedStoreId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                selectedStoreId: event.target.value,
                selectedOutboundId: "",
                selectedReturnId: "",
              }))
            }
          >
            <option value="">스토어 선택</option>
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.storeName}
              </option>
            ))}
          </select>

          <select
            value={filters.registrationType}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                registrationType: event.target.value as RegistrationType,
              }))
            }
          >
            <option value="ALL">전체 카테고리</option>
            <option value="RFM">Rocket Growth 카테고리</option>
          </select>

          <input
            value={filters.query}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                query: event.target.value,
              }))
            }
            placeholder="카테고리명, 코드, 센터명, 주소 검색"
            style={{ minWidth: 260 }}
          />

          <input
            value={filters.operatorUserId}
            onChange={(event) =>
              setFilters((current) => ({
                ...current,
                operatorUserId: event.target.value,
              }))
            }
            placeholder="작업자 ID"
            style={{ minWidth: 150 }}
          />

          <button
            className="button secondary"
            disabled={!filters.selectedStoreId}
            onClick={() => {
              void categoriesQuery.refetch();
              void outboundCentersQuery.refetch();
              void returnCentersQuery.refetch();
            }}
          >
            새로고침
          </button>
        </div>
      </div>

      <div className="metric-grid">
        <div className="metric">
          <div className="metric-label">카테고리</div>
          <div className="metric-value">{categoryCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">출고지</div>
          <div className="metric-value">{outboundCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">반품지</div>
          <div className="metric-value">{returnCount}</div>
        </div>
        <div className="metric">
          <div className="metric-label">작업자 ID</div>
          <div className="metric-value" style={{ fontSize: "1rem" }}>
            {filters.operatorUserId || "-"}
          </div>
        </div>
      </div>

      {[categoriesQuery.data?.message, outboundCentersQuery.data?.message, returnCentersQuery.data?.message]
        .filter(Boolean)
        .map((message) => (
          <div key={message} className="feedback warning">
            <strong>조회 메모</strong>
            <div className="muted">{message}</div>
          </div>
        ))}

      {feedback ? (
        <div className={`feedback ${feedback.type}`}>
          <strong>{feedback.title}</strong>
          <div>{feedback.message}</div>
        </div>
      ) : null}

      <div className="card">
        <div className="segmented-control">
          <button
            type="button"
            className={`segmented-button ${filters.panel === "categories" ? "active" : ""}`}
            onClick={() => setFilters((current) => ({ ...current, panel: "categories" }))}
          >
            카테고리
          </button>
          <button
            type="button"
            className={`segmented-button ${filters.panel === "outbound" ? "active" : ""}`}
            onClick={() => setFilters((current) => ({ ...current, panel: "outbound" }))}
          >
            출고지
          </button>
          <button
            type="button"
            className={`segmented-button ${filters.panel === "returns" ? "active" : ""}`}
            onClick={() => setFilters((current) => ({ ...current, panel: "returns" }))}
          >
            반품지
          </button>
        </div>
      </div>

      {filters.panel === "categories" ? (
        <div className="card">
          <div className="card-header">
            <div>
              <strong>카테고리 목록</strong>
              <div className="muted">등록 가능한 카테고리 코드와 경로를 조회합니다.</div>
            </div>
            <StatusBadge tone={liveCategory ? "live" : "draft"} label={liveCategory ? "실연동" : "fallback"} />
          </div>
          {categoriesQuery.isLoading ? (
            <div className="empty">카테고리를 불러오는 중입니다.</div>
          ) : categoriesQuery.error ? (
            <div className="empty">{(categoriesQuery.error as Error).message}</div>
          ) : categoriesQuery.data?.items.length ? (
            <div className="table-wrap">
              <table className="table">
                <thead>
                  <tr>
                    <th>코드</th>
                    <th>카테고리</th>
                    <th>경로</th>
                    <th>Depth</th>
                    <th>상태</th>
                  </tr>
                </thead>
                <tbody>
                  {categoriesQuery.data.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.code}</td>
                      <td>
                        <div>
                          <strong>{item.name}</strong>
                        </div>
                        <div className="muted">{item.leaf ? "leaf" : `children ${item.childCount}`}</div>
                      </td>
                      <td>{item.path}</td>
                      <td>{item.depth}</td>
                      <td>
                        <span className={`status-pill ${item.status.toLowerCase()}`}>{item.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty">조회된 카테고리가 없습니다.</div>
          )}
        </div>
      ) : null}

      {filters.panel === "outbound" ? (
        <div className="editor-layout">
          <div className="card">
            <div className="card-header">
              <div>
                <strong>출고지 목록</strong>
                <div className="muted">목록에서 센터를 선택하면 우측 편집 카드에 현재 값이 채워집니다.</div>
              </div>
              <div className="detail-actions">
                <StatusBadge tone={liveOutbound ? "live" : "draft"} label={liveOutbound ? "쓰기 가능" : "fallback"} />
                <button
                  className="button ghost"
                  onClick={() => {
                    setFilters((current) => ({ ...current, selectedOutboundId: "" }));
                    setOutboundForm(defaultOutboundForm());
                  }}
                >
                  새 출고지
                </button>
              </div>
            </div>

            {outboundCentersQuery.isLoading ? (
              <div className="empty">출고지를 불러오는 중입니다.</div>
            ) : outboundCentersQuery.error ? (
              <div className="empty">{(outboundCentersQuery.error as Error).message}</div>
            ) : outboundRows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>출고지 코드</th>
                      <th>센터명</th>
                      <th>주소</th>
                      <th>연락처</th>
                      <th>생성일</th>
                    </tr>
                  </thead>
                  <tbody>
                    {outboundRows.map((row) => (
                      <tr
                        key={row.id}
                        className={filters.selectedOutboundId === row.id ? "table-row-selected" : undefined}
                        onClick={() =>
                          setFilters((current) => ({
                            ...current,
                            selectedOutboundId: row.id,
                          }))
                        }
                      >
                        <td>{row.outboundShippingPlaceCode}</td>
                        <td>
                          <div>
                            <strong>{row.shippingPlaceName}</strong>
                          </div>
                          <div className="muted">{row.global ? "global" : "local"}</div>
                        </td>
                        <td>
                          <div>{row.address ?? "-"}</div>
                          <div className="muted">{row.addressDetail ?? "-"}</div>
                        </td>
                        <td>
                          <div>{row.companyContactNumber ?? "-"}</div>
                          <div className="muted">{row.phoneNumber2 ?? "-"}</div>
                        </td>
                        <td>{formatDate(row.createDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">조회된 출고지가 없습니다.</div>
            )}
          </div>

          <div className="stack">
            <div className="card editor-section">
              <div className="card-header">
                <div>
                  <strong>{outboundForm.outboundShippingPlaceCode ? "출고지 수정" : "출고지 생성"}</strong>
                  <div className="muted">주소와 원거리 배송비 설정까지 함께 저장합니다.</div>
                </div>
                {outboundForm.outboundShippingPlaceCode ? (
                  <span className="status-pill live">{outboundForm.outboundShippingPlaceCode}</span>
                ) : null}
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>출고지명</span>
                  <input
                    value={outboundForm.shippingPlaceName}
                    onChange={(event) =>
                      setOutboundForm((current) => ({ ...current, shippingPlaceName: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>사용 가능</span>
                  <select
                    value={outboundForm.usable}
                    onChange={(event) =>
                      setOutboundForm((current) => ({ ...current, usable: event.target.value as ToggleValue }))
                    }
                  >
                    <option value="">기본값 유지</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </label>
                <label className="field">
                  <span>Global</span>
                  <select
                    value={outboundForm.global}
                    onChange={(event) =>
                      setOutboundForm((current) => ({ ...current, global: event.target.value as ToggleValue }))
                    }
                  >
                    <option value="">기본값 유지</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </label>
              </div>

              <div className="stack" style={{ gap: "0.75rem" }}>
                <div className="detail-box-header">
                  <strong>출고 주소</strong>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      setOutboundForm((current) => ({
                        ...current,
                        placeAddresses: [...current.placeAddresses, emptyAddressDraft()],
                      }))
                    }
                  >
                    주소 추가
                  </button>
                </div>

                {outboundForm.placeAddresses.map((address) => (
                  <div key={address.id} className="detail-card">
                    <div className="detail-box-header">
                      <strong>주소</strong>
                      <button
                        className="button ghost"
                        type="button"
                        disabled={outboundForm.placeAddresses.length === 1}
                        onClick={() =>
                          setOutboundForm((current) => ({
                            ...current,
                            placeAddresses: current.placeAddresses.filter((item) => item.id !== address.id),
                          }))
                        }
                      >
                        삭제
                      </button>
                    </div>
                    <div className="form-grid">
                      <label className="field"><span>주소 타입</span><input value={address.addressType} onChange={(event) => setOutboundForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, addressType: event.target.value } : item) }))} /></label>
                      <label className="field"><span>국가 코드</span><input value={address.countryCode} onChange={(event) => setOutboundForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, countryCode: event.target.value } : item) }))} /></label>
                      <label className="field"><span>대표 연락처</span><input value={address.companyContactNumber} onChange={(event) => setOutboundForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, companyContactNumber: event.target.value } : item) }))} /></label>
                      <label className="field"><span>보조 연락처</span><input value={address.phoneNumber2} onChange={(event) => setOutboundForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, phoneNumber2: event.target.value } : item) }))} /></label>
                      <label className="field"><span>우편번호</span><input value={address.returnZipCode} onChange={(event) => setOutboundForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, returnZipCode: event.target.value } : item) }))} /></label>
                      <label className="field"><span>기본 주소</span><input value={address.returnAddress} onChange={(event) => setOutboundForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, returnAddress: event.target.value } : item) }))} /></label>
                    </div>
                    <label className="field">
                      <span>상세 주소</span>
                      <input
                        value={address.returnAddressDetail}
                        onChange={(event) =>
                          setOutboundForm((current) => ({
                            ...current,
                            placeAddresses: current.placeAddresses.map((item) =>
                              item.id === address.id
                                ? { ...item, returnAddressDetail: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>

              <div className="stack" style={{ gap: "0.75rem" }}>
                <div className="detail-box-header">
                  <strong>원거리 배송비</strong>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      setOutboundForm((current) => ({
                        ...current,
                        remoteInfos: [...current.remoteInfos, emptyRemoteInfoDraft()],
                      }))
                    }
                  >
                    항목 추가
                  </button>
                </div>

                {outboundForm.remoteInfos.map((item) => (
                  <div key={item.id} className="detail-card">
                    <div className="detail-box-header">
                      <strong>원거리 배송 설정</strong>
                      <button
                        className="button ghost"
                        type="button"
                        disabled={outboundForm.remoteInfos.length === 1}
                        onClick={() =>
                          setOutboundForm((current) => ({
                            ...current,
                            remoteInfos: current.remoteInfos.filter((remote) => remote.id !== item.id),
                          }))
                        }
                      >
                        삭제
                      </button>
                    </div>
                    <div className="form-grid">
                      <label className="field"><span>remoteInfoId</span><input value={item.remoteInfoId} onChange={(event) => setOutboundForm((current) => ({ ...current, remoteInfos: current.remoteInfos.map((remote) => remote.id === item.id ? { ...remote, remoteInfoId: event.target.value } : remote) }))} /></label>
                      <label className="field"><span>배송 코드</span><input value={item.deliveryCode} onChange={(event) => setOutboundForm((current) => ({ ...current, remoteInfos: current.remoteInfos.map((remote) => remote.id === item.id ? { ...remote, deliveryCode: event.target.value } : remote) }))} /></label>
                      <label className="field"><span>제주 배송비</span><input inputMode="numeric" value={item.jeju} onChange={(event) => setOutboundForm((current) => ({ ...current, remoteInfos: current.remoteInfos.map((remote) => remote.id === item.id ? { ...remote, jeju: event.target.value } : remote) }))} /></label>
                      <label className="field"><span>비제주 배송비</span><input inputMode="numeric" value={item.notJeju} onChange={(event) => setOutboundForm((current) => ({ ...current, remoteInfos: current.remoteInfos.map((remote) => remote.id === item.id ? { ...remote, notJeju: event.target.value } : remote) }))} /></label>
                      <label className="field"><span>사용 가능</span><select value={item.usable} onChange={(event) => setOutboundForm((current) => ({ ...current, remoteInfos: current.remoteInfos.map((remote) => remote.id === item.id ? { ...remote, usable: event.target.value as ToggleValue } : remote) }))}><option value="">기본값 유지</option><option value="true">true</option><option value="false">false</option></select></label>
                    </div>
                  </div>
                ))}
              </div>

              <div className="detail-actions">
                <button className="button" disabled={!liveOutbound || isSaving !== null} onClick={() => void submitOutbound()}>
                  {isSaving === "outbound" ? "저장 중..." : outboundForm.outboundShippingPlaceCode ? "출고지 수정" : "출고지 생성"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {filters.panel === "returns" ? (
        <div className="editor-layout">
          <div className="card">
            <div className="card-header">
              <div>
                <strong>반품지 목록</strong>
                <div className="muted">배송사 코드와 반품비 정책까지 함께 관리합니다.</div>
              </div>
              <div className="detail-actions">
                <StatusBadge tone={liveReturns ? "live" : "draft"} label={liveReturns ? "쓰기 가능" : "fallback"} />
                <button
                  className="button ghost"
                  onClick={() => {
                    setFilters((current) => ({ ...current, selectedReturnId: "" }));
                    setReturnForm(defaultReturnForm());
                  }}
                >
                  새 반품지
                </button>
              </div>
            </div>

            {returnCentersQuery.isLoading ? (
              <div className="empty">반품지를 불러오는 중입니다.</div>
            ) : returnCentersQuery.error ? (
              <div className="empty">{(returnCentersQuery.error as Error).message}</div>
            ) : returnRows.length ? (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>반품지 코드</th>
                      <th>센터명</th>
                      <th>배송사</th>
                      <th>주소</th>
                      <th>상태</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnRows.map((row) => (
                      <tr
                        key={row.id}
                        className={filters.selectedReturnId === row.id ? "table-row-selected" : undefined}
                        onClick={() =>
                          setFilters((current) => ({
                            ...current,
                            selectedReturnId: row.id,
                          }))
                        }
                      >
                        <td>{row.returnCenterCode}</td>
                        <td>
                          <div>
                            <strong>{row.shippingPlaceName}</strong>
                          </div>
                          <div className="muted">{formatDate(row.createdAt)}</div>
                        </td>
                        <td>
                          <div>{row.deliverName ?? "-"}</div>
                          <div className="muted">{row.deliverCode ?? "-"}</div>
                        </td>
                        <td>
                          <div>{row.address ?? "-"}</div>
                          <div className="muted">{row.addressDetail ?? "-"}</div>
                        </td>
                        <td>
                          <span className={`status-pill ${row.usable ? "success" : "draft"}`}>
                            {row.usable ? "usable" : "readonly"}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty">조회된 반품지가 없습니다.</div>
            )}
          </div>

          <div className="stack">
            <div className="card editor-section">
              <div className="card-header">
                <div>
                  <strong>{returnForm.returnCenterCode ? "반품지 수정" : "반품지 생성"}</strong>
                  <div className="muted">반품 주소와 택배비 정책을 함께 저장합니다.</div>
                </div>
                {returnForm.returnCenterCode ? (
                  <span className="status-pill live">{returnForm.returnCenterCode}</span>
                ) : null}
              </div>

              <div className="form-grid">
                <label className="field">
                  <span>반품지명</span>
                  <input
                    value={returnForm.shippingPlaceName}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, shippingPlaceName: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>사용 가능</span>
                  <select
                    value={returnForm.usable}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, usable: event.target.value as ToggleValue }))
                    }
                  >
                    <option value="">기본값 유지</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                </label>
                <label className="field">
                  <span>배송사 코드</span>
                  <input
                    value={returnForm.deliverCode}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, deliverCode: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>배송사명</span>
                  <input
                    value={returnForm.deliverName}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, deliverName: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>계약번호</span>
                  <input
                    value={returnForm.contractNumber}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, contractNumber: event.target.value }))
                    }
                  />
                </label>
                <label className="field">
                  <span>계약 고객번호</span>
                  <input
                    value={returnForm.contractCustomerNumber}
                    onChange={(event) =>
                      setReturnForm((current) => ({ ...current, contractCustomerNumber: event.target.value }))
                    }
                  />
                </label>
              </div>

              <div className="stack" style={{ gap: "0.75rem" }}>
                <div className="detail-box-header">
                  <strong>반품 주소</strong>
                  <button
                    className="button ghost"
                    type="button"
                    onClick={() =>
                      setReturnForm((current) => ({
                        ...current,
                        placeAddresses: [...current.placeAddresses, emptyAddressDraft()],
                      }))
                    }
                  >
                    주소 추가
                  </button>
                </div>
                {returnForm.placeAddresses.map((address) => (
                  <div key={address.id} className="detail-card">
                    <div className="detail-box-header">
                      <strong>반품 주소</strong>
                      <button
                        className="button ghost"
                        type="button"
                        disabled={returnForm.placeAddresses.length === 1}
                        onClick={() =>
                          setReturnForm((current) => ({
                            ...current,
                            placeAddresses: current.placeAddresses.filter((item) => item.id !== address.id),
                          }))
                        }
                      >
                        삭제
                      </button>
                    </div>
                    <div className="form-grid">
                      <label className="field"><span>주소 타입</span><input value={address.addressType} onChange={(event) => setReturnForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, addressType: event.target.value } : item) }))} /></label>
                      <label className="field"><span>국가 코드</span><input value={address.countryCode} onChange={(event) => setReturnForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, countryCode: event.target.value } : item) }))} /></label>
                      <label className="field"><span>대표 연락처</span><input value={address.companyContactNumber} onChange={(event) => setReturnForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, companyContactNumber: event.target.value } : item) }))} /></label>
                      <label className="field"><span>보조 연락처</span><input value={address.phoneNumber2} onChange={(event) => setReturnForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, phoneNumber2: event.target.value } : item) }))} /></label>
                      <label className="field"><span>우편번호</span><input value={address.returnZipCode} onChange={(event) => setReturnForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, returnZipCode: event.target.value } : item) }))} /></label>
                      <label className="field"><span>기본 주소</span><input value={address.returnAddress} onChange={(event) => setReturnForm((current) => ({ ...current, placeAddresses: current.placeAddresses.map((item) => item.id === address.id ? { ...item, returnAddress: event.target.value } : item) }))} /></label>
                    </div>
                    <label className="field">
                      <span>상세 주소</span>
                      <input
                        value={address.returnAddressDetail}
                        onChange={(event) =>
                          setReturnForm((current) => ({
                            ...current,
                            placeAddresses: current.placeAddresses.map((item) =>
                              item.id === address.id
                                ? { ...item, returnAddressDetail: event.target.value }
                                : item,
                            ),
                          }))
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>

              <div className="stack" style={{ gap: "0.75rem" }}>
                <strong>반품비 정책</strong>
                <FeeFields
                  form={returnForm}
                  onChange={(key, value) =>
                    setReturnForm((current) => ({
                      ...current,
                      [key]: value,
                    }))
                  }
                />
              </div>

              <div className="detail-actions">
                <button className="button" disabled={!liveReturns || isSaving !== null} onClick={() => void submitReturn()}>
                  {isSaving === "return" ? "저장 중..." : returnForm.returnCenterCode ? "반품지 수정" : "반품지 생성"}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
