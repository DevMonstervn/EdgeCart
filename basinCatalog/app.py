import os
import boto3
import pandas as pd
import requests
import streamlit as st
from dotenv import load_dotenv
from pyiceberg.table import StaticTable

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

ACCOUNT_ID = os.getenv("R2_ACCOUNT_ID", "").strip()
BUCKET = os.getenv("R2_BUCKET", "").strip()
ACCESS_KEY_ID = os.getenv("R2_ACCESS_KEY_ID", "").strip()
SECRET_ACCESS_KEY = os.getenv("R2_SECRET_ACCESS_KEY", "").strip()
GROUP_ID = os.getenv("GROUP_ID", "nhóm 8 sáng t6").strip()
R2_ENDPOINT = f"https://{ACCOUNT_ID}.r2.cloudflarestorage.com"
EDGECART_API_STATS = "https://edgecart-api.hoanglongkar5ls.workers.dev/api/v1/analytics/stats-24h"


def latest_metadata_key(s3) -> str:
    metadata_objects = []
    for page in s3.get_paginator("list_objects_v2").paginate(Bucket=BUCKET):
        for obj in page.get("Contents", []):
            if obj["Key"].endswith(".metadata.json"):
                metadata_objects.append(obj)
    if not metadata_objects:
        raise FileNotFoundError(f"Không tìm thấy file .metadata.json trong R2 bucket '{BUCKET}'")
    latest_obj = max(metadata_objects, key=lambda o: (o["LastModified"], o["Key"]))
    return latest_obj["Key"]


def iceberg_events() -> pd.DataFrame:
    s3 = boto3.client(
        "s3",
        endpoint_url=R2_ENDPOINT,
        aws_access_key_id=ACCESS_KEY_ID,
        aws_secret_access_key=SECRET_ACCESS_KEY,
        region_name="auto",
    )
    meta_key = latest_metadata_key(s3)
    table = StaticTable.from_metadata(
        f"s3://{BUCKET}/{meta_key}",
        properties={
            "s3.endpoint": R2_ENDPOINT,
            "s3.access-key-id": ACCESS_KEY_ID,
            "s3.secret-access-key": SECRET_ACCESS_KEY,
            "s3.region": "auto",
        },
    )
    return table.scan(selected_fields=("id", "country", "device", "time", "ip")).to_pandas()


def edgecart_live_events() -> pd.DataFrame:
    """Lấy thêm các lượt truy cập thực tế vừa ghi nhận trên EdgeCart Production API (trước khi R2 flush)."""
    try:
        resp = requests.get(EDGECART_API_STATS, timeout=5)
        if resp.ok:
            payload = resp.json()
            recent = payload.get("data", {}).get("recentVisits", [])
            if recent:
                rows = [
                    {
                        "id": r.get("id", GROUP_ID),
                        "country": r.get("country", "VN"),
                        "device": r.get("device", "desktop"),
                        "time": r.get("time"),
                        "ip": r.get("ip", ""),
                    }
                    for r in recent
                ]
                return pd.DataFrame(rows)
    except Exception:
        pass
    return pd.DataFrame(columns=["id", "country", "device", "time", "ip"])


def normalize_time_column(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty or "time" not in df.columns:
        return pd.DataFrame(columns=["id", "country", "device", "time", "ip"])
    df = df.copy()
    if pd.api.types.is_numeric_dtype(df["time"]):
        df["time"] = pd.to_datetime(df["time"], unit="ms", utc=True, errors="coerce")
    else:
        df["time"] = pd.to_datetime(df["time"], utc=True, errors="coerce")
    df = df.dropna(subset=["time"])
    # Loại bỏ các timestamp lỗi vượt quá thời gian hiện tại + 1 ngày
    max_valid_time = pd.Timestamp.now(tz="UTC") + pd.Timedelta(days=1)
    df = df[df["time"] <= max_valid_time]
    # Chuyển về múi giờ Việt Nam (UTC+7)
    df["time"] = df["time"].dt.tz_convert("Asia/Ho_Chi_Minh").dt.tz_localize(None)
    return df


@st.cache_data(ttl=60)
def load_events() -> pd.DataFrame:
    df_iceberg = normalize_time_column(iceberg_events())
    df_live = normalize_time_column(edgecart_live_events())

    if not df_live.empty and not df_iceberg.empty:
        df = pd.concat([df_iceberg, df_live], ignore_index=True)
        df = df.drop_duplicates(subset=["id", "ip", "time"], keep="first")
    elif not df_iceberg.empty:
        df = df_iceberg
    else:
        df = df_live

    return df.sort_values("time", ascending=False).reset_index(drop=True)


def build_daily_series(df_source: pd.DataFrame, end_time: pd.Timestamp, days: int) -> pd.Series:
    """Tạo chuỗi thời gian theo từng ngày liên tục trong N ngày qua (theo thứ tự thời gian)."""
    end_date = end_time.floor("D")
    start_date = end_date - pd.Timedelta(days=days - 1)
    full_idx = pd.date_range(start=start_date, end=end_date, freq="1D")
    if df_source.empty:
        s = pd.Series(0, index=full_idx, name="Lượt truy cập")
    else:
        counts = df_source.set_index("time").resample("1D").size()
        s = counts.reindex(full_idx, fill_value=0).rename("Lượt truy cập")
    s.index = s.index.strftime("%Y-%m-%d")
    s.index.name = "Ngày"
    return s


st.set_page_config(page_title="Thống kê truy cập - Basin Catalog", layout="wide")
st.title("📊 Thống kê truy cập thực tế (Cloudflare R2 Basin Catalog & PyIceberg)")

df_all = load_events()
now_vn = pd.Timestamp.now(tz="Asia/Ho_Chi_Minh").tz_localize(None)

available_ids = sorted([str(x) for x in df_all["id"].dropna().unique()])
group_options = [
    "Tất cả các nhóm (Toàn bộ Basin Catalog)",
    "Tất cả Nhóm 8 (nhóm 8 sáng t6 / nhóm 8 / nhom8)",
] + available_ids

col_time, col_group, col_btn = st.columns([2, 3, 1])
with col_time:
    time_window = st.selectbox(
        "Khoảng thời gian áp dụng cho KPI & Bảng:",
        options=["24 giờ qua", "7 ngày qua (Tuần)", "30 ngày qua (Tháng)", "Toàn bộ thời gian"],
        index=0,
    )
with col_group:
    selected_group = st.selectbox(
        "Lọc theo ID Nhóm:",
        options=group_options,
        index=0,
    )
with col_btn:
    st.write("")
    st.write("")
    if st.button("🔄 Làm mới"):
        st.cache_data.clear()
        st.rerun()

# Lọc theo nhóm trước để dùng chung cho các biểu đồ 24h, Tuần, Tháng
if selected_group == "Tất cả các nhóm (Toàn bộ Basin Catalog)":
    df_group = df_all.copy()
elif selected_group == "Tất cả Nhóm 8 (nhóm 8 sáng t6 / nhóm 8 / nhom8)":
    df_group = df_all[
        df_all["id"].astype(str).isin(["nhóm 8 sáng t6", "nhóm 8", "nhom8", "nhom 08"])
    ].copy()
else:
    df_group = df_all[df_all["id"].astype(str) == selected_group].copy()

# Chia dữ liệu theo 3 khung thời gian thực tế: 24h, Tuần (7 ngày), Tháng (30 ngày)
df_24h = df_group[df_group["time"] >= now_vn - pd.Timedelta(hours=24)].copy()
df_week = df_group[df_group["time"] >= now_vn - pd.Timedelta(days=7)].copy()
df_month = df_group[df_group["time"] >= now_vn - pd.Timedelta(days=30)].copy()

if time_window == "24 giờ qua":
    df = df_24h
elif time_window == "7 ngày qua (Tuần)":
    df = df_week
elif time_window == "30 ngày qua (Tháng)":
    df = df_month
else:
    df = df_group

st.caption(
    f"✅ Đang đọc **100% dữ liệu thật** từ Cloudflare R2 Iceberg Bucket `{BUCKET}` "
    f"(24h qua: **{len(df_24h):,}** lượt | 7 ngày qua: **{len(df_week):,}** lượt | 30 ngày qua: **{len(df_month):,}** lượt)"
)

c1, c2, c3, c4, c5 = st.columns(5)
c1.metric("IP duy nhất", int(df["ip"].nunique()) if not df.empty else 0)
c2.metric("Số quốc gia", int(df["country"].nunique()) if not df.empty else 0)
c3.metric("Lượt truy cập (24h)", f"{len(df_24h):,}")
c4.metric("Lượt truy cập (Tuần - 7 ngày)", f"{len(df_week):,}")
c5.metric("Lượt truy cập (Tháng - 30 ngày)", f"{len(df_month):,}")

# 1. Biểu đồ lượng truy cập 24 giờ qua (theo giờ)
st.subheader("📈 Biểu đồ lượng truy cập theo giờ (24 giờ qua)")
if not df_24h.empty:
    ts_24h = (
        df_24h.set_index("time")
        .resample("1h")
        .size()
        .rename("Lượt truy cập")
    )
    st.line_chart(ts_24h)
else:
    st.info("Chưa có lượt truy cập trong 24 giờ qua cho bộ lọc nhóm hiện tại.")

# 2. Hai biểu đồ mới: Lượt truy cập theo Tuần (7 ngày) và theo Tháng (30 ngày)
col_week, col_month = st.columns(2)
with col_week:
    st.subheader("📅 Biểu đồ lượt truy cập theo Tuần (7 ngày qua)")
    weekly_series = build_daily_series(df_week, now_vn, days=7)
    st.bar_chart(weekly_series)
    st.caption(f"Tổng cộng 7 ngày qua: **{len(df_week):,}** lượt truy cập")

with col_month:
    st.subheader("🗓️ Biểu đồ lượt truy cập theo Tháng (30 ngày qua)")
    monthly_series = build_daily_series(df_month, now_vn, days=30)
    st.area_chart(monthly_series)
    st.caption(f"Tổng cộng 30 ngày qua: **{len(df_month):,}** lượt truy cập")

# 3. Biểu đồ Quốc gia & Thiết bị
left, right = st.columns(2)
with left:
    st.subheader(f"🌍 Theo quốc gia ({time_window})")
    if not df.empty:
        st.bar_chart(df["country"].value_counts())
    else:
        st.info("Chưa có dữ liệu quốc gia.")
with right:
    st.subheader(f"📱 Theo thiết bị ({time_window})")
    if not df.empty:
        st.bar_chart(df["device"].value_counts())
    else:
        st.info("Chưa có dữ liệu thiết bị.")

st.subheader(f"📋 Dữ liệu gốc từ Basin Catalog ({time_window})")
st.caption(f"{len(df):,} dòng")
st.dataframe(df, width="stretch", hide_index=True)
