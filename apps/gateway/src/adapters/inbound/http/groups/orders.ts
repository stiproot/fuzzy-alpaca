import { HttpApiEndpoint, HttpApiGroup } from "@effect/platform"
import { Schema } from "effect"
import { OrderId } from "../../../../domain/primitives.js"
import {
  CancelAllResponse,
  CreateOrderRequest,
  ListOrdersQuery,
  OrderPage,
  OrderResponse,
  ReplaceOrderRequest,
} from "../../../../domain/schemas/order.js"
import {
  AssetNotFoundT,
  AssetNotTradableT,
  ConfirmationRequiredT,
  ContractErrorT,
  InsufficientBuyingPowerT,
  InternalErrorT,
  MaxOrderSizeExceededT,
  OrderNotCancelableT,
  OrderNotFoundT,
  PdtRuleViolationT,
  RateLimitedT,
  TimeoutT,
  UnavailableT,
  ValidationErrorT,
} from "../envelope.js"
import { Authorization } from "../middleware/auth.js"

export const ordersGroup = HttpApiGroup.make("orders")
  .add(
    HttpApiEndpoint.post("createOrder", "/v1/orders")
      .setPayload(CreateOrderRequest)
      .addSuccess(OrderResponse, { status: 201 })
      .addError(ValidationErrorT)
      .addError(MaxOrderSizeExceededT)
      .addError(AssetNotFoundT)
      .addError(AssetNotTradableT)
      .addError(InsufficientBuyingPowerT)
      .addError(PdtRuleViolationT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.get("listOrders", "/v1/orders")
      .setUrlParams(ListOrdersQuery)
      .addSuccess(OrderPage)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.get("getOrder", "/v1/orders/:orderId")
      .setPath(Schema.Struct({ orderId: Schema.String }))
      .setUrlParams(Schema.Struct({ byClientOrderId: Schema.optional(Schema.BooleanFromString) }))
      .addSuccess(OrderResponse)
      .addError(OrderNotFoundT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.patch("replaceOrder", "/v1/orders/:orderId")
      .setPath(Schema.Struct({ orderId: OrderId }))
      .setPayload(ReplaceOrderRequest)
      .addSuccess(OrderResponse)
      .addError(OrderNotFoundT)
      .addError(OrderNotCancelableT)
      .addError(InsufficientBuyingPowerT)
      .addError(PdtRuleViolationT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.del("cancelOrder", "/v1/orders/:orderId")
      .setPath(Schema.Struct({ orderId: OrderId }))
      .addSuccess(OrderResponse)
      .addError(OrderNotFoundT)
      .addError(OrderNotCancelableT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .add(
    HttpApiEndpoint.del("cancelAllOrders", "/v1/orders")
      .setUrlParams(Schema.Struct({ confirm: Schema.optional(Schema.BooleanFromString) }))
      .addSuccess(CancelAllResponse)
      .addError(ConfirmationRequiredT)
      .addError(ValidationErrorT)
      .addError(RateLimitedT)
      .addError(UnavailableT)
      .addError(TimeoutT)
      .addError(ContractErrorT)
      .addError(InternalErrorT)
  )
  .middleware(Authorization)
