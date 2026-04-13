export type HubAction = {
  title: string;
  description: string;
  href: string;
  badgeTone: "live" | "shared" | "coming";
  badgeLabel: string;
};

export type HubSection = {
  key: string;
  title: string;
  description: string;
  actions: readonly HubAction[];
};

export function buildChannelsHubSections(counts: {
  naverConnected: number;
  coupangConnected: number;
}): readonly HubSection[] {
  return [
    {
      key: "connections",
      title: "연결 상태 / 점검",
      description: "채널 연결 확인과 인증키 점검을 먼저 진행합니다.",
      actions: [
        {
          title: "COUPANG 연결 / 설정",
          description: "vendorId, 인증키, 연결 확인과 쿠팡 세부 운영 화면으로 이어지는 진입점입니다.",
          href: "/coupang/connection",
          badgeTone: "live",
          badgeLabel: `${counts.coupangConnected}개 연결`,
        },
        {
          title: "NAVER 연결 / 설정",
          description: "NAVER 커머스 API 연결 상태와 정산, 문의, 클레임 원본 화면으로 이동합니다.",
          href: "/naver/connection",
          badgeTone: "live",
          badgeLabel: `${counts.naverConnected}개 연결`,
        },
      ],
    },
    {
      key: "source-screens",
      title: "원본 화면 진입",
      description: "통합 허브가 아니라 원본 채널 화면으로 바로 이어지는 진입점입니다.",
      actions: [
        {
          title: "COUPANG 원본 화면",
          description: "문의, 반품, 교환, 물류, 주문 같은 채널별 세부 화면을 원본 흐름 그대로 엽니다.",
          href: "/coupang/inquiries",
          badgeTone: "shared",
          badgeLabel: "세부",
        },
        {
          title: "NAVER 원본 화면",
          description: "문의, 클레임, 주문, 정산, 판매자 정보 같은 채널별 세부 화면을 다시 확인합니다.",
          href: "/naver/inquiries",
          badgeTone: "shared",
          badgeLabel: "세부",
        },
      ],
    },
    {
      key: "channel-tools",
      title: "채널별 주요 도구",
      description: "자주 여는 대표 원본 화면만 추려서 둡니다.",
      actions: [
        {
          title: "COUPANG 주문 / 출고",
          description: "쿠팡 주문과 출고 원본 흐름을 다시 확인합니다.",
          href: "/coupang/orders",
          badgeTone: "shared",
          badgeLabel: "원본",
        },
        {
          title: "COUPANG 물류",
          description: "카테고리, 물류센터, 배송 관련 기준 화면으로 이동합니다.",
          href: "/coupang/logistics",
          badgeTone: "shared",
          badgeLabel: "원본",
        },
        {
          title: "NAVER 주문",
          description: "네이버 주문 원본 화면에서 주문 흐름을 직접 점검합니다.",
          href: "/naver/orders",
          badgeTone: "shared",
          badgeLabel: "원본",
        },
        {
          title: "NAVER 클레임",
          description: "취소, 반품, 교환 같은 예외 처리를 채널 원본 화면에서 확인합니다.",
          href: "/naver/claims",
          badgeTone: "shared",
          badgeLabel: "원본",
        },
      ],
    },
  ];
}

export function buildSettingsHubSections(): readonly HubSection[] {
  return [
    {
      key: "connections",
      title: "연결 설정",
      description: "채널 인증, 연결 점검, 판매자 설정을 조정합니다.",
      actions: [
        {
          title: "NAVER 연결 설정",
          description: "NAVER Commerce API 연결, 점검, 판매자 설정을 관리합니다.",
          href: "/naver/connection",
          badgeTone: "live",
          badgeLabel: "연결",
        },
        {
          title: "COUPANG 연결 설정",
          description: "vendorId, accessKey, secretKey, base URL과 연결 검증을 관리합니다.",
          href: "/coupang/connection",
          badgeTone: "live",
          badgeLabel: "연결",
        },
      ],
    },
    {
      key: "advanced-tools",
      title: "운영 고급 도구",
      description: "메인 운영 흐름을 방해하지 않게 별도 섹션으로 모아 둡니다.",
      actions: [
        {
          title: "작업 로그 / 복구",
          description: "실패 작업 복구 화면과 로그 상세를 함께 확인합니다.",
          href: "/work-center",
          badgeTone: "shared",
          badgeLabel: "운영",
        },
        {
          title: "필드 동기화",
          description: "플랫폼 필드를 대상 테이블로 반영하는 운영용 동기화 규칙을 관리합니다.",
          href: "/engine/field-sync",
          badgeTone: "shared",
          badgeLabel: "고급",
        },
        {
          title: "실행 이력",
          description: "최근 실행 결과와 상태를 레거시 실행 이력 화면에서 확인합니다.",
          href: "/engine/runs",
          badgeTone: "coming",
          badgeLabel: "레거시",
        },
        {
          title: "초안 카탈로그",
          description: "카탈로그 초안과 실행 전 단계를 직접 확인합니다.",
          href: "/engine/catalog",
          badgeTone: "coming",
          badgeLabel: "레거시",
        },
      ],
    },
  ];
}
