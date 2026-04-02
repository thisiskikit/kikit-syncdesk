import { registerCoupangExchangeRetryHandlers } from "../../http/handlers/coupang/exchanges";
import { registerCoupangOrderRetryHandlers } from "../../http/handlers/coupang/orders";
import { registerCoupangProductRetryHandlers } from "../../http/handlers/coupang/products";
import { registerCoupangReturnRetryHandlers } from "../../http/handlers/coupang/returns";
import { registerCoupangShipmentRetryHandlers } from "../../http/handlers/coupang/shipments";
import { registerCoupangStoreRetryHandlers } from "../../http/handlers/coupang/stores";

let retryHandlersRegistered = false;

export function registerCoupangRetryHandlers() {
  if (retryHandlersRegistered) {
    return;
  }

  retryHandlersRegistered = true;

  registerCoupangStoreRetryHandlers();
  registerCoupangProductRetryHandlers();
  registerCoupangOrderRetryHandlers();
  registerCoupangShipmentRetryHandlers();
  registerCoupangReturnRetryHandlers();
  registerCoupangExchangeRetryHandlers();
}
