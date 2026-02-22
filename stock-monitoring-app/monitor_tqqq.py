from __future__ import annotations

import argparse
import json
import os
import random
import requests
import smtplib
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

import pandas as pd
import yfinance as yf
from yfinance import shared as yf_shared
from dotenv import load_dotenv

try:
    import requests_cache
except Exception:  # pragma: no cover
    requests_cache = None

try:
    from curl_cffi import requests as curl_requests
except Exception:  # pragma: no cover
    curl_requests = None

load_dotenv()


def clean_env_value(value: str | None) -> str | None:
    if value is None:
        return None
    cleaned = value.strip().strip('"').strip("'").strip()
    return cleaned or None


def parse_int_env(var_name: str, default: int) -> int:
    raw = clean_env_value(os.getenv(var_name))
    if not raw:
        return default
    try:
        return int(raw)
    except ValueError:
        return default


def parse_str_env(var_name: str, default: str) -> str:
    value = clean_env_value(os.getenv(var_name))
    return value or default


def build_cached_session():
    if requests_cache is None:
        # Fallback when requests-cache is not installed in minimal deployments.
        session = requests.Session()
        session.headers.update(
            {
                "User-Agent": (
                    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                )
            }
        )
        return session

    session = requests_cache.CachedSession(
        cache_name="yahoo_http_cache",
        backend="sqlite",
        expire_after=timedelta(hours=24),
        allowable_methods=("GET",),
        stale_if_error=True,
    )
    session.headers.update(
        {
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            )
        }
    )
    return session


def build_curl_session():
    if curl_requests is None:
        return None
    for fingerprint in ("chrome", "chrome124", "chrome120", "chrome119", "chrome110"):
        try:
            session = curl_requests.Session(impersonate=fingerprint)
            # Some curl_cffi builds accept unsupported fingerprints at construction time
            # and fail only when sending a request, so probe once before selecting it.
            probe = session.get("https://example.com", timeout=10, impersonate=fingerprint)
            probe.raise_for_status()
            session.headers.update(
                {
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
                    )
                }
            )
            return session
        except Exception:
            continue
    return None


def is_rate_limit_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "429" in message or "too many requests" in message or "rate limit" in message


def fetch_from_stooq(symbol: str, lookback_days: int) -> pd.DataFrame:
    stooq_symbol = f"{symbol.lower()}.us"
    df = pd.read_csv(f"https://stooq.com/q/d/l/?s={stooq_symbol}&i=d")
    if df.empty:
        raise RuntimeError("Stooq returned empty data.")
    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Close"]).sort_values("Date")
    cutoff = (datetime.now(timezone.utc) - timedelta(days=lookback_days + 200)).date()
    df = df[df["Date"].dt.date >= cutoff]
    if len(df) < 200:
        raise RuntimeError(f"Stooq fallback has insufficient candles: got {len(df)} rows.")
    return df.set_index("Date")[["Open", "High", "Low", "Close"]]


def fetch_from_yahoo_chart_with_curl(symbol: str, lookback_days: int, chrome_session) -> pd.DataFrame:
    if chrome_session is None:
        raise RuntimeError("curl_cffi session unavailable for Yahoo chart fallback.")
    end_dt = datetime.now(timezone.utc)
    start_dt = end_dt - timedelta(days=lookback_days + 30)
    url = f"https://query2.finance.yahoo.com/v8/finance/chart/{symbol}"
    params = {
        "period1": int(start_dt.timestamp()),
        "period2": int(end_dt.timestamp()),
        "interval": "1d",
        "includePrePost": "false",
        "events": "div,splits",
    }
    response = chrome_session.get(url, params=params, timeout=20, impersonate=chrome_session.impersonate)
    response.raise_for_status()
    payload = response.json()
    result = (((payload or {}).get("chart") or {}).get("result") or [None])[0]
    if not result:
        raise RuntimeError("Yahoo chart fallback returned no result.")

    timestamps = result.get("timestamp") or []
    quotes = (((result.get("indicators") or {}).get("quote") or [None])[0]) or {}
    if not timestamps or not quotes:
        raise RuntimeError("Yahoo chart fallback missing candles.")

    df = pd.DataFrame(
        {
            "Date": pd.to_datetime(timestamps, unit="s", utc=True).tz_convert(None),
            "Open": quotes.get("open"),
            "High": quotes.get("high"),
            "Low": quotes.get("low"),
            "Close": quotes.get("close"),
        }
    ).dropna(subset=["Close"])
    if len(df) < 200:
        raise RuntimeError(f"Yahoo chart fallback has insufficient candles: got {len(df)} rows.")
    return df.set_index("Date")[["Open", "High", "Low", "Close"]]


def fetch_market_snapshot(symbol: str, lookback_days: int = 250) -> tuple[dict, pd.DataFrame]:
    chrome_session = build_curl_session()

    # Retry backoff waits: 2s, 4s, 8s. First attempt has no wait.
    waits = [0, 2, 4, 8]
    last_exc: Exception | None = None

    for attempt, wait_seconds in enumerate(waits, start=1):
        if wait_seconds:
            time.sleep(wait_seconds)

        try:
            download_kwargs = {
                "period": f"{lookback_days}d",
                "interval": "1d",
                "auto_adjust": False,
                "progress": False,
                "threads": False,
            }
            # Newer yfinance versions require a curl_cffi session type if session is provided.
            # Do not pass a plain requests session to avoid YFDataException in CI.
            if chrome_session is not None:
                download_kwargs["session"] = chrome_session
            hist = yf.download(symbol, **download_kwargs)

            # Normalize yfinance output shape across versions/providers.
            if isinstance(hist.columns, pd.MultiIndex):
                # Prefer top-level OHLC names when possible.
                if "Close" in hist.columns.get_level_values(0):
                    hist = hist.copy()
                    hist.columns = [col[0] for col in hist.columns]
                else:
                    hist = hist.copy()
                    hist.columns = [str(col[-1]) for col in hist.columns]
            else:
                hist = hist.copy()

            # Some responses use lowercase or ticker-qualified names.
            rename_candidates = {
                "open": "Open",
                "high": "High",
                "low": "Low",
                "close": "Close",
                f"{symbol.upper()}_OPEN": "Open",
                f"{symbol.upper()}_HIGH": "High",
                f"{symbol.upper()}_LOW": "Low",
                f"{symbol.upper()}_CLOSE": "Close",
            }
            hist.rename(columns={k: v for k, v in rename_candidates.items() if k in hist.columns}, inplace=True)

            if "Close" not in hist.columns:
                raise RuntimeError(f"Yahoo response missing Close column. Columns: {list(hist.columns)[:10]}")

            if hist.empty:
                yf_error = str(yf_shared._ERRORS.get(symbol, "")).strip()
                if yf_error:
                    raise RuntimeError(yf_error)
                raise RuntimeError("No data returned from Yahoo Finance.")

            hist = hist.dropna(subset=["Close"])
            if len(hist) < 200:
                raise RuntimeError(f"Insufficient candles for 200 SMA: got {len(hist)} rows.")

            live_price = float(hist["Close"].iloc[-1])
            sma_200 = float(hist["Close"].rolling(window=200).mean().iloc[-1])
            dip_threshold = sma_200 * 0.97
            if live_price <= dip_threshold:
                state = "BELOW_THRESHOLD"
            elif live_price >= sma_200:
                state = "ABOVE_SMA"
            else:
                state = "BETWEEN_THRESHOLD_AND_SMA"

            snapshot = {
                "symbol": symbol,
                "price": live_price,
                "sma_200": sma_200,
                "dip_threshold": dip_threshold,
                "state": state,
                "as_of": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            }
            return snapshot, hist
        except Exception as exc:
            last_exc = exc
            if is_rate_limit_error(exc) and attempt < len(waits):
                print(f"[retry {attempt}/{len(waits)}] Yahoo rate-limited, retrying in {waits[attempt]}s...")
                continue
            break

    if last_exc is not None and is_rate_limit_error(last_exc):
        try:
            print("Yahoo remained rate-limited via yfinance; trying curl_cffi Yahoo chart fallback.")
            hist = fetch_from_yahoo_chart_with_curl(symbol, lookback_days, chrome_session)
        except Exception:
            print("Yahoo chart fallback failed; using Stooq fallback data.")
            hist = fetch_from_stooq(symbol, lookback_days)
        live_price = float(hist["Close"].iloc[-1])
        sma_200 = float(hist["Close"].rolling(window=200).mean().iloc[-1])
        dip_threshold = sma_200 * 0.97
        if live_price <= dip_threshold:
            state = "BELOW_THRESHOLD"
        elif live_price >= sma_200:
            state = "ABOVE_SMA"
        else:
            state = "BETWEEN_THRESHOLD_AND_SMA"
        snapshot = {
            "symbol": symbol,
            "price": live_price,
            "sma_200": sma_200,
            "dip_threshold": dip_threshold,
            "state": state,
            "as_of": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        }
        return snapshot, hist

    if last_exc is not None:
        raise last_exc
    raise RuntimeError("Market data fetch failed for unknown reason.")


def load_status(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        with path.open("r", encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except (OSError, json.JSONDecodeError):
        return {}


def save_status(path: Path, status: dict) -> None:
    with path.open("w", encoding="utf-8") as f:
        json.dump(status, f, indent=2)


def send_primary_email_alert(subject: str, body_text: str, body_html: str) -> None:
    email_user = clean_env_value(os.getenv("EMAIL_USER"))
    email_pass = clean_env_value(os.getenv("EMAIL_PASS")) or clean_env_value(os.getenv("EMAIL_APP_PASSWORD"))
    smtp_server = parse_str_env("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = parse_int_env("SMTP_PORT", 587)
    recipient = clean_env_value(os.getenv("ALERT_EMAIL_TO")) or clean_env_value(os.getenv("EMAIL_TO")) or email_user

    # Gmail app passwords are often copied in grouped chunks like "abcd efgh ijkl mnop".
    # Remove spaces to avoid SMTP bad-credentials caused by formatting artifacts.
    if email_pass and " " in email_pass:
        email_pass = email_pass.replace(" ", "")

    if not email_user or not email_pass or not recipient:
        raise RuntimeError(
            "Missing email configuration. Set EMAIL_USER and EMAIL_PASS "
            "(or EMAIL_APP_PASSWORD), plus ALERT_EMAIL_TO (or EMAIL_TO)."
        )
    if "your_gmail" in email_user.lower() or "example.com" in email_user.lower():
        raise RuntimeError(
            "EMAIL_USER appears to still be placeholder text. "
            "Replace it in .env with your actual Gmail address."
        )
    if "your_16_char" in email_pass.lower() or "app_password" in email_pass.lower():
        raise RuntimeError(
            "EMAIL_PASS appears to still be a placeholder text. "
            "Replace it in .env with your real 16-character Gmail App Password."
        )

    msg = EmailMessage()
    msg["From"] = email_user
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.set_content(body_text)
    msg.add_alternative(body_html, subtype="html")

    try:
        with smtplib.SMTP(smtp_server, smtp_port, timeout=20) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(email_user, email_pass)
            server.send_message(msg)
    except smtplib.SMTPAuthenticationError as exc:
        raise RuntimeError(
            "SMTP authentication failed. For Gmail, use an App Password (not your normal password), "
            "and ensure 2-Step Verification is enabled on the sender account."
        ) from exc
    except smtplib.SMTPException as exc:
        raise RuntimeError(f"SMTP send failed: {exc}") from exc


def send_push(title: str, message: str, priority: int = 0, dry_run: bool = False) -> None:
    pushover_user = clean_env_value(os.getenv("PUSHOVER_USER_KEY"))
    pushover_token = clean_env_value(os.getenv("PUSHOVER_API_TOKEN"))
    if dry_run:
        print(f"[TEST] Would send Pushover (priority={priority}): {title} | {message}")
        if not pushover_user or not pushover_token:
            print("[TEST] Pushover keys not set; this is expected in simulation mode.")
        return
    if not pushover_user or not pushover_token:
        raise RuntimeError("Missing PUSHOVER_USER_KEY or PUSHOVER_API_TOKEN in environment.")

    payload = {
        "token": pushover_token,
        "user": pushover_user,
        "title": title,
        "message": message[:1024],
        "priority": priority,
    }
    if priority == 2:
        # Pushover requires retry/expire for emergency priority.
        payload["retry"] = 60
        payload["expire"] = 3600

    response = requests.post("https://api.pushover.net/1/messages.json", data=payload, timeout=20)
    if response.status_code >= 400:
        raise RuntimeError(f"Pushover send failed ({response.status_code}): {response.text[:300]}")


def evaluate_alerts(snapshot: dict, status_path: Path, dry_run: bool = False, force_notify: bool = False) -> None:
    status = load_status(status_path)
    monitor = status.get("monitor_state", {})

    prev_state = monitor.get("last_state", "UNKNOWN")
    state = snapshot["state"]
    state_changed = state != prev_state

    # Muzzle rule: only notify on transitions, except explicit forced tests.
    should_send_dip = (state_changed and state == "BELOW_THRESHOLD") or (force_notify and state == "BELOW_THRESHOLD")
    should_send_recovery = (state_changed and state == "ABOVE_SMA") or (force_notify and state == "ABOVE_SMA")

    if should_send_dip:
        subject = "[TQQQ] Dip Alert (confirmed across 2 runs)"
        body_text = (
            "TQQQ dip confirmed.\n\n"
            f"Current Price: ${snapshot['price']:.2f}\n"
            f"200-day SMA: ${snapshot['sma_200']:.2f}\n"
            f"Dip Threshold (-3%): ${snapshot['dip_threshold']:.2f}\n"
            f"Previous State: {prev_state}\n"
            f"Current State: {state}\n"
        )
        body_html = (
            "<h3>TQQQ Dip Confirmed</h3>"
            f"<p><b>Current Price:</b> ${snapshot['price']:.2f}</p>"
            f"<p><b>200-day SMA:</b> ${snapshot['sma_200']:.2f}</p>"
            f"<p><b>Dip Threshold (-3%):</b> ${snapshot['dip_threshold']:.2f}</p>"
            f"<p><b>Previous State:</b> {prev_state}</p>"
            f"<p><b>Current State:</b> {state}</p>"
        )
        push_message = (
            f"{snapshot['symbol']} DIP ALERT: ${snapshot['price']:.2f} below threshold ${snapshot['dip_threshold']:.2f}. "
            "Check dashboard now."
        )
        if dry_run:
            print(f"[TEST] Would send primary HTML email: {subject}\n{body_text}")
            send_push(title=subject, message=push_message, priority=2, dry_run=True)
        else:
            # Primary immediate alert path.
            send_push(title=subject, message=push_message, priority=2, dry_run=False)
            # Secondary log/archive path.
            try:
                send_primary_email_alert(subject, body_text, body_html)
            except Exception as exc:
                print(f"Warning: secondary email send failed (dip alert): {exc}")
    elif should_send_recovery:
        subject = "[TQQQ] Recovery Alert: crossed back above 200 SMA"
        body_text = (
            "TQQQ recovery alert.\n\n"
            f"Current Price: ${snapshot['price']:.2f}\n"
            f"200-day SMA: ${snapshot['sma_200']:.2f}\n"
            f"Dip Threshold (-3%): ${snapshot['dip_threshold']:.2f}\n"
            f"Previous State: {prev_state}\n"
            f"Current State: {state}\n"
        )
        body_html = (
            "<h3>TQQQ Recovery Alert</h3>"
            f"<p><b>Current Price:</b> ${snapshot['price']:.2f}</p>"
            f"<p><b>200-day SMA:</b> ${snapshot['sma_200']:.2f}</p>"
            f"<p><b>Dip Threshold (-3%):</b> ${snapshot['dip_threshold']:.2f}</p>"
            f"<p><b>Previous State:</b> {prev_state}</p>"
            f"<p><b>Current State:</b> {state}</p>"
        )
        push_message = (
            f"{snapshot['symbol']} RECOVERY: ${snapshot['price']:.2f} above 200 SMA ${snapshot['sma_200']:.2f}. "
            "Check dashboard."
        )
        if dry_run:
            print(f"[TEST] Would send primary HTML email: {subject}\n{body_text}")
            send_push(title=subject, message=push_message, priority=0, dry_run=True)
        else:
            # Primary immediate alert path.
            send_push(title=subject, message=push_message, priority=0, dry_run=False)
            # Secondary log/archive path.
            try:
                send_primary_email_alert(subject, body_text, body_html)
            except Exception as exc:
                print(f"Warning: secondary email send failed (recovery alert): {exc}")
    else:
        if state == "BELOW_THRESHOLD" and not state_changed:
            print("No new alert: state remains BELOW_THRESHOLD (muzzle active).")
        else:
            print("No alert conditions matched for this run.")

    status["monitor_state"] = {
        "last_state": state,
        "last_state_changed": state_changed,
        "last_price": snapshot["price"],
        "last_sma_200": snapshot["sma_200"],
        "last_threshold": snapshot["dip_threshold"],
        "updated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    save_status(status_path, status)


def build_forced_dip_snapshot(symbol: str, status_file: Path) -> dict:
    status = load_status(status_file)
    monitor = status.get("monitor_state", {})
    baseline_sma = float(monitor.get("last_sma_200", 50.0))
    dip_threshold = baseline_sma * 0.97
    forced_price = max(0.01, dip_threshold * 0.995)
    return {
        "symbol": symbol,
        "price": forced_price,
        "sma_200": baseline_sma,
        "dip_threshold": dip_threshold,
        "state": "BELOW_THRESHOLD",
        "as_of": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


def run_once(symbol: str, status_file: Path, dry_run: bool = False, force_dip_test: bool = False) -> None:
    if force_dip_test:
        snapshot = build_forced_dip_snapshot(symbol, status_file)
        hist = None
    else:
        snapshot, hist = fetch_market_snapshot(symbol)
    print(
        f"{symbol} | close=${snapshot['price']:.2f} | "
        f"sma200=${snapshot['sma_200']:.2f} | threshold=${snapshot['dip_threshold']:.2f} | "
        f"rows={len(hist) if hist is not None else 'n/a'} | state={snapshot['state']}"
    )
    if force_dip_test:
        print("Force dip test mode: bypassing transition muzzle for notification test.")
    evaluate_alerts(snapshot, status_file, dry_run=dry_run, force_notify=force_dip_test)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="TQQQ monitor with anti-rate-limit and alert confirmation logic.")
    parser.add_argument("--symbol", default="TQQQ", help="Ticker symbol to monitor.")
    parser.add_argument("--status-file", default="status.json", help="Path to status.json persistence file.")
    parser.add_argument("--dry-run", action="store_true", help="Do not send email; print alerts only.")
    parser.add_argument("--test", action="store_true", help="Alias of --dry-run for test simulation mode.")
    parser.add_argument(
        "--force-dip-test",
        action="store_true",
        help="Force a synthetic below-threshold snapshot and send dip alert flow immediately for testing.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    effective_dry_run = args.dry_run or args.test
    # Rate-limit resilience: add startup jitter to avoid synchronized request bursts.
    if not effective_dry_run and not args.force_dip_test:
        delay = random.randint(0, 30)
        print(f"Startup jitter: sleeping {delay}s before market fetch.")
        time.sleep(delay)
    run_once(
        symbol=args.symbol,
        status_file=Path(args.status_file),
        dry_run=effective_dry_run,
        force_dip_test=args.force_dip_test,
    )


if __name__ == "__main__":
    main()
