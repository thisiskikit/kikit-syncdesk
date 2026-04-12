# Cloud Run 브랜치 배포 규칙

## 목적

GitHub Actions에서 `main`과 `codex/dev`를 서로 다른 Cloud Run 서비스로 배포합니다.

## 브랜치별 대상

- `main` 푸시: 기존 [deploy-kikit-price-change.yml](/D:/Dev/Archive_3.0/kikit_price_change/.github/workflows/deploy-kikit-price-change.yml) 워크플로우가 `kikit-price-change` 서비스에 배포합니다.
- `codex/dev` 푸시: 새 [deploy-kikit-price-change-dev.yml](/D:/Dev/Archive_3.0/kikit_price_change/.github/workflows/deploy-kikit-price-change-dev.yml) 워크플로우가 `kikit-price-change-dev` 서비스에 배포합니다.

## 공통 사양

- Google Cloud 프로젝트: `python-350012`
- 리전: `asia-northeast3`
- 이미지 레지스트리: `asia-northeast3-docker.pkg.dev/python-350012/cloud-run-source-deploy/kikit-syncdesk/*`
- 리소스: `memory=1Gi`, `cpu=1`, `timeout=300`, `max-instances=1`
- 서비스 계정: `835286545835-compute@developer.gserviceaccount.com`
- Cloud SQL 연결: `python-350012:asia-northeast3:kikit-pg-20260203`
- VPC 설정: `network=default`, `subnet=cr-egress-asia-ne3`, `vpc-egress=all-traffic`
- 시크릿: `DATABASE_URL`, `MASTER_SKU_DATABASE_URL`

## 주의사항

- 현재 `codex/dev` 서비스도 `main`과 같은 Cloud SQL 연결과 시크릿을 사용합니다.
- 따라서 서비스는 분리되지만 데이터 경계는 분리되지 않습니다.
- 개발용 데이터를 완전히 분리하려면 dev 전용 Cloud SQL 또는 dev 전용 시크릿을 만든 뒤 워크플로우 값을 따로 바꿔야 합니다.
