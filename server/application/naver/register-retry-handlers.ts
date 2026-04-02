import { registerNaverClaimRetryHandlers } from "../../http/handlers/naver-claims";
import { registerNaverOrderRetryHandlers } from "../../http/handlers/naver-orders";
import { registerNaverProductRetryHandlers } from "../../http/handlers/naver-products";

let retryHandlersRegistered = false;

export function registerNaverRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerNaverProductRetryHandlers();
  registerNaverOrderRetryHandlers();
  registerNaverClaimRetryHandlers();
}
