from __future__ import annotations

import json
import os
import smtplib
import time
from datetime import datetime, timedelta, timezone
from email.message import EmailMessage
from pathlib import Path

import pandas as pd
import plotly.graph_objects as go
import streamlit as st
import yfinance as yf
from dotenv import load_dotenv

load_dotenv()

APP_TITLE = "QQQ Monitoring & Strategy Sandbox"
STATUS_PATH = Path(__file__).parent / "status.json"
DATA_CACHE_PATH = Path(__file__).parent / "last_good_qqq_data.csv"


def load_last_status() -> dict:
    if not STATUS_PATH.exists():
        return {"state": "UNKNOWN"}
    try:
        with STATUS_PATH.open("r", encoding="utf-8") as f:
            payload = json.load(f)
            return payload if isinstance(payload, dict) else {"state": "UNKNOWN"}
    except (OSError, json.JSONDecodeError):
        return {"state": "UNKNOWN"}


def save_status(state: str, last_price: float, sma_200: float, dip_threshold: float) -> None:
    payload = {
        "state": state,
        "last_price": last_price,
        "sma_200": sma_200,
        "dip_threshold": dip_threshold,
        "updated_at_utc": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }
    with STATUS_PATH.open("w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2)


def normalize_and_enrich_market_data(df: pd.DataFrame) -> pd.DataFrame:
    if isinstance(df.columns, pd.MultiIndex):
        # yfinance can return multi-level columns even for a single ticker.
        df.columns = [col[0] if isinstance(col, tuple) else col for col in df.columns]

    df = df.reset_index()
    required = {"Date", "Open", "High", "Low", "Close"}
    missing = required.difference(df.columns)
    if missing:
        raise ValueError(f"Missing expected market columns: {sorted(missing)}")

    df["Date"] = pd.to_datetime(df["Date"], errors="coerce")
    df = df.dropna(subset=["Date", "Close"]).sort_values("Date")
    df["SMA_200"] = df["Close"].rolling(window=200).mean()
    df["Dip_Threshold"] = df["SMA_200"] * 0.97
    return df


def save_data_cache(df: pd.DataFrame) -> None:
    try:
        df.to_csv(DATA_CACHE_PATH, index=False)
    except OSError:
        # Non-fatal: app can still run without local cache write permissions.
        pass


def load_data_cache() -> pd.DataFrame:
    if not DATA_CACHE_PATH.exists():
        return pd.DataFrame()
    try:
        cached = pd.read_csv(DATA_CACHE_PATH)
        if "Date" in cached.columns:
            cached["Date"] = pd.to_datetime(cached["Date"], errors="coerce")
        return normalize_and_enrich_market_data(cached)
    except Exception:
        return pd.DataFrame()


@st.cache_data(ttl=60 * 60)
def fetch_qqq_data() -> pd.DataFrame:
    end = datetime.now(timezone.utc)
    start = end - timedelta(days=370)
    errors = []

    # Primary path: explicit date range.
    try:
        df = yf.download(
            "QQQ",
            start=start.date(),
            end=end.date(),
            progress=False,
            auto_adjust=False,
            threads=False,
        )
    except Exception as exc:
        errors.append(f"download(start/end) failed: {exc}")
        df = pd.DataFrame()

    # Fallback path: period-based history if the first path is empty/rate-limited.
    if df.empty:
        time.sleep(1)
        try:
            df = yf.Ticker("QQQ").history(period="12mo", interval="1d", auto_adjust=False)
        except Exception as exc:
            errors.append(f"Ticker.history(period) failed: {exc}")
            df = pd.DataFrame()

    # Secondary provider fallback: Stooq public daily CSV.
    if df.empty:
        try:
            stooq_df = pd.read_csv("https://stooq.com/q/d/l/?s=qqq.us&i=d")
            if not stooq_df.empty:
                stooq_df["Date"] = pd.to_datetime(stooq_df["Date"], errors="coerce")
                stooq_df = stooq_df.dropna(subset=["Date"]).sort_values("Date")
                cutoff = (datetime.now(timezone.utc) - timedelta(days=370)).date()
                stooq_df = stooq_df[stooq_df["Date"].dt.date >= cutoff]
                df = stooq_df[["Date", "Open", "High", "Low", "Close"]].copy()
        except Exception as exc:
            errors.append(f"Stooq fallback failed: {exc}")
            df = pd.DataFrame()

    if not df.empty:
        normalized = normalize_and_enrich_market_data(df)
        save_data_cache(normalized)
        return normalized

    cached = load_data_cache()
    if not cached.empty:
        return cached

    detail = "; ".join(errors) if errors else "No rows returned from Yahoo Finance."
    raise ValueError(f"No market data returned for QQQ and no local cache found. {detail}")


def derive_status(price: float, sma_200: float, dip_threshold: float) -> tuple[str, str]:
    if price <= dip_threshold:
        return "DIP DETECTED", "BELOW"
    if price >= sma_200:
        return "RECOVERY SIGNAL", "ABOVE"
    return "SAFE", "BETWEEN"


def send_test_email(recipient: str, subject: str, body: str) -> tuple[bool, str]:
    email_user = os.getenv("EMAIL_USER")
    email_pass = os.getenv("EMAIL_PASS")
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", "587"))

    if not email_user or not email_pass:
        return False, "Missing EMAIL_USER or EMAIL_PASS in environment (.env)."
    if not recipient:
        return False, "Recipient email is required."

    msg = EmailMessage()
    msg["From"] = email_user
    msg["To"] = recipient
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(smtp_server, smtp_port, timeout=20) as server:
            server.starttls()
            server.login(email_user, email_pass)
            server.send_message(msg)
        return True, f"Test email sent to {recipient}."
    except Exception as exc:  # pragma: no cover
        return False, f"Email send failed: {exc}"


def build_chart(df: pd.DataFrame, sandbox_price: float) -> go.Figure:
    clean = df.dropna(subset=["SMA_200"]).copy()
    cross_down = clean[(clean["Close"] <= clean["Dip_Threshold"]) & (clean["Close"].shift(1) > clean["Dip_Threshold"].shift(1))]
    cross_up = clean[(clean["Close"] >= clean["SMA_200"]) & (clean["Close"].shift(1) < clean["SMA_200"].shift(1))]

    fig = go.Figure()
    fig.add_trace(
        go.Candlestick(
            x=clean["Date"],
            open=clean["Open"],
            high=clean["High"],
            low=clean["Low"],
            close=clean["Close"],
            name="QQQ",
        )
    )
    fig.add_trace(go.Scatter(x=clean["Date"], y=clean["SMA_200"], mode="lines", name="200 SMA"))
    fig.add_trace(
        go.Scatter(
            x=clean["Date"],
            y=clean["Dip_Threshold"],
            mode="lines",
            name="Dip Threshold (-3%)",
            line={"dash": "dash"},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=cross_down["Date"],
            y=cross_down["Close"],
            mode="markers",
            name="Dip Crossover",
            marker={"color": "red", "size": 9, "symbol": "x"},
        )
    )
    fig.add_trace(
        go.Scatter(
            x=cross_up["Date"],
            y=cross_up["Close"],
            mode="markers",
            name="Recovery Crossover",
            marker={"color": "green", "size": 9, "symbol": "circle"},
        )
    )

    last_date = clean["Date"].iloc[-1]
    fig.add_trace(
        go.Scatter(
            x=[last_date],
            y=[sandbox_price],
            mode="markers+text",
            name="Live Marker",
            marker={"size": 14, "color": "orange", "symbol": "diamond"},
            text=[f"Sandbox: ${sandbox_price:.2f}"],
            textposition="top right",
        )
    )

    fig.update_layout(
        title="QQQ Price, 200 SMA, and Dip Threshold",
        xaxis_title="Date",
        yaxis_title="Price (USD)",
        xaxis_rangeslider_visible=False,
        legend_title_text="Signals",
        height=680,
    )
    return fig


def render_status_card(status_label: str, state_key: str, prev_state: str) -> None:
    color_map = {
        "DIP DETECTED": "#ff4b4b",
        "RECOVERY SIGNAL": "#00c853",
        "SAFE": "#ffb300",
    }
    card_color = color_map.get(status_label, "#607d8b")
    st.markdown(
        f"""
        <div style="padding: 1rem; border-radius: 0.8rem; background-color: {card_color}; color: white;">
            <h3 style="margin: 0;">{status_label}</h3>
            <p style="margin: 0.35rem 0 0 0;">Current state key: {state_key}</p>
            <p style="margin: 0.2rem 0 0 0;">Persisted previous state: {prev_state}</p>
        </div>
        """,
        unsafe_allow_html=True,
    )


def main() -> None:
    st.set_page_config(page_title=APP_TITLE, layout="wide")
    st.title(APP_TITLE)
    st.caption("Tracks QQQ vs. 200-day SMA with a sandbox price tester and email connectivity check.")

    try:
        df = fetch_qqq_data()
    except Exception as exc:
        st.error(f"Could not load QQQ data right now: {exc}")
        st.info("This is usually temporary (Yahoo rate limit). Please refresh in a minute.")
        st.stop()
    if DATA_CACHE_PATH.exists():
        st.caption("Data source: live Yahoo data when available; local cache fallback when rate-limited.")
    clean = df.dropna(subset=["SMA_200"]).copy()
    latest = clean.iloc[-1]
    latest_close = float(latest["Close"])
    latest_sma = float(latest["SMA_200"])
    latest_threshold = float(latest["Dip_Threshold"])
    distance_to_threshold_pct = ((latest_close - latest_threshold) / latest_threshold) * 100

    persisted = load_last_status()
    prev_state = persisted.get("state", "UNKNOWN")

    st.sidebar.header("Sandbox Mode")
    min_price = max(1.0, round(float(clean["Low"].min()) * 0.8, 2))
    max_price = round(float(clean["High"].max()) * 1.2, 2)
    sandbox_price = st.sidebar.slider(
        "Custom Current Price ($)",
        min_value=float(min_price),
        max_value=float(max_price),
        value=round(latest_close, 2),
        step=0.01,
    )
    sandbox_price = st.sidebar.number_input("Or type a precise price", value=float(sandbox_price), step=0.01)

    status_label, state_key = derive_status(float(sandbox_price), latest_sma, latest_threshold)

    st.sidebar.markdown("### Email Test")
    recipient = st.sidebar.text_input("Recipient Email")
    if st.sidebar.button("Send Test Email", use_container_width=True):
        ok, message = send_test_email(
            recipient=recipient,
            subject="QQQ Monitor: SMTP Connection Test",
            body=(
                "This is a real test email sent from the Streamlit QQQ monitor app.\n\n"
                f"Sandbox price: ${float(sandbox_price):.2f}\n"
                f"200 SMA: ${latest_sma:.2f}\n"
                f"Dip threshold: ${latest_threshold:.2f}\n"
                f"Status: {status_label}\n"
            ),
        )
        if ok:
            st.sidebar.success(message)
        else:
            st.sidebar.error(message)

    save_status(state_key, float(sandbox_price), latest_sma, latest_threshold)

    left, right = st.columns([2.8, 1.2])
    with left:
        fig = build_chart(df, float(sandbox_price))
        st.plotly_chart(fig, use_container_width=True)
    with right:
        render_status_card(status_label, state_key, prev_state)
        st.markdown("### Key Metrics")
        metrics_df = pd.DataFrame(
            [
                {"Metric": "Current QQQ Price", "Value": f"${latest_close:.2f}"},
                {"Metric": "200 SMA Value", "Value": f"${latest_sma:.2f}"},
                {"Metric": "Distance to Threshold (%)", "Value": f"{distance_to_threshold_pct:.2f}%"},
            ]
        )
        st.dataframe(metrics_df, hide_index=True, use_container_width=True)
        st.caption(
            "Current values are based on the latest market close from yfinance "
            "(for QQQ, based on the latest available session)."
        )


if __name__ == "__main__":
    main()
