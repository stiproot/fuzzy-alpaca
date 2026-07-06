# Trading basics

A plain-language tour of every trading concept this service touches. Each section ends with how
the concept shows up in our API.

## Stocks, tickers, and exchanges

A **stock** (or *equity*) is a small ownership share of a company. Stocks trade on **exchanges**
(NYSE, NASDAQ), and each is identified by a **ticker symbol** — `AAPL` is Apple, `BRK.B` is
Berkshire Hathaway class B. Anything tradable (a stock, an ETF) is generically called an
**asset**. An asset can be temporarily **halted** (trading suspended) or not tradable at all.

> In our API: `GET /v1/assets` to search, `GET /v1/assets/:symbol` to check `tradable`,
> `shortable`, `fractionable` before ordering.

## Market hours and the calendar

The US stock market is open roughly 9:30–16:00 Eastern, weekdays, minus holidays. Outside those
hours you can still *submit* orders — they just wait (status `accepted`) until the market opens.
Some orders can run in **extended hours** (pre-market/after-hours) if flagged.

> In our API: `GET /v1/clock` (is the market open? when next?), `GET /v1/calendar` (trading days
> and their hours), `extendedHours` flag on orders.

## Prices: quotes, trades, and bars

At any moment a stock has two prices:

- **Bid** — the highest price anyone is currently willing to *pay*. You sell at the bid.
- **Ask** — the lowest price anyone is currently willing to *accept*. You buy at the ask.

Together they're a **quote**; the gap between them is the **spread** (tight for busy stocks,
wide for sleepy ones). A **trade** is an actual completed transaction — "100 shares at $189.62".
The famous "current price" you see in the news is just the last trade.

A **bar** (or *candle*) compresses a time window into five numbers — **OHLCV**: the **O**pen
(first price), **H**igh, **L**ow, **C**lose (last price), and **V**olume (shares traded). A "1Day
bar" summarizes a whole day; a "1Min bar" one minute. Bars are the raw material of most analysis.

> In our API: `GET /v1/market-data/:symbol/quote`, `/trade`, `/bars` (pick a `timeframe`), and
> `/snapshot` — the one-call bundle of latest quote + trade + recent bars.

## Orders

An **order** is an instruction to buy or sell. Its parts:

- **Side** — `buy` or `sell`.
- **Quantity** — either a share count (`qty: "5"`, fractions allowed for many assets) or a dollar
  amount (`notional: "500"` = "buy $500 worth").
- **Type** — *how* to execute:
  - **market** — "fill me now at whatever the price is". Fast, but you accept the current price.
  - **limit** — "only at my price or better" (`limitPrice`). You control price, but might never fill.
  - **stop** — "once the price touches X, fire a market order" (`stopPrice`). Often used to cut
    losses ("stop-loss").
  - **stop_limit** — "once the price touches X, fire a *limit* order" — a stop with price control.
- **Time in force** — *how long* the order lives:
  - **day** — dies at market close if unfilled.
  - **gtc** — "good till canceled": lives until it fills or you cancel it.
  - **ioc** — "immediate or cancel": fill whatever you can instantly, cancel the rest.
  - **fok** — "fill or kill": fill *everything* instantly or cancel it all.

### Order lifecycle

An order moves through **statuses**: `accepted`/`new` (waiting) → possibly `partially_filled` →
`filled` (done), or instead `canceled`, `expired` (time-in-force ran out), `rejected`, or
`replaced`. A **fill** is the actual execution; `filledQty` and `filledAvgPrice` tell you how
much and at what average price. **Replacing** an order swaps it for a new one with tweaked
parameters (new price, new qty) — the old order's history stays linked to the new one.

> In our API: `POST /v1/orders`, `GET /v1/orders` (watch statuses), `PATCH` to replace, `DELETE`
> to cancel. The required `clientOrderId` is *your* chosen ID for the order, so a resubmitted
> request can never accidentally create a duplicate.

## Positions and P&L

Own something and you have a **position**:

- **Long** — you bought shares hoping the price rises. The normal case.
- **Short** — you *borrowed and sold* shares hoping to buy them back cheaper. Profits when the
  price falls; risky, because losses are unlimited if it rises.

Position vocabulary:

- **Average entry price** — the mean price you paid across your buys.
- **Cost basis** — total money you put in (entry price × quantity).
- **Market value** — what the position is worth right now.
- **Unrealized P&L** — profit & loss *on paper* (market value − cost basis). "Unrealized" because
  you haven't sold; the moment you sell, it becomes **realized**. The `plpc` variants are the
  same as a percentage.

**Closing** a position means selling it (or buying back a short). Closing submits a real order —
a **liquidation order** — that fills like any other; partial closes ("sell 4 of my 10 shares")
are normal.

> In our API: `GET /v1/positions` (the P&L overview), `DELETE /v1/positions/:symbol` (close all,
> or partial via `?qty=` / `?percentage=`) — the response is the liquidation order.

## Your account: cash, equity, margin

- **Cash** — uninvested money sitting in the account.
- **Equity** — total account value: cash + market value of all positions.
- **Buying power** — how much you can spend *right now*. Often larger than cash because brokers
  lend against your holdings — that borrowing is **margin**, and a `multiplier` of 2 means you
  can control up to 2× your equity. Margin amplifies both gains and losses.
- **Insufficient buying power** — the broker refusing an order you can't afford.

> In our API: `GET /v1/account` — agents should check `buyingPower` before sizing orders.

## The PDT rule (pattern day trader)

A **day trade** is buying and selling the same stock within one day. US rules flag accounts that
make 4+ day trades in 5 business days as **pattern day traders**, and if such an account holds
under $25,000 equity it gets blocked from further day trading. The account report includes
`patternDayTrader` and `daytradeCount` so you can stay clear of the line.

> In our API: violations surface as the `PdtRuleViolation` error (422).

## Paper vs live trading

**Paper trading** is a full simulation — real market data, fake money. Same API, same order
mechanics, zero risk; it's how you validate a strategy (or a service like this one) before real
dollars move. **Live** is the real thing. This service is paper-by-default and every order
response says which mode it ran in (`tradingMode`).

## Quick glossary

| Term | One-liner |
|---|---|
| Spread | Gap between bid and ask — an implicit cost of every trade |
| Fill | An actual execution of (part of) your order |
| OHLCV | Open/High/Low/Close/Volume — the five numbers in a bar |
| Notional | Order size expressed in dollars instead of shares |
| GTC | Good-till-canceled — order lives until filled or canceled |
| Slippage | Difference between the price you expected and the fill you got |
| Liquidation | Selling a position off (fully or partially) |
| Margin | Trading with money borrowed against your holdings |
| Shortable | Whether the broker will let you short this asset |
| Fractionable | Whether you can buy fractions of a share |
| Halted | Trading in the asset is temporarily suspended |
