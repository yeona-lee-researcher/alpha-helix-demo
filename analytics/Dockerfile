# Analytics 사이드카 — FastAPI(vectorbt·xgboost·shap·hmmlearn·quantstats)
FROM python:3.11-slim
WORKDIR /app

# numpy/scipy/xgboost/hmmlearn 등 빌드용 컴파일러
RUN apt-get update \
 && apt-get install -y --no-install-recommends build-essential \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
EXPOSE 8001
# 내부 토큰은 compose 에서 ANALYTICS_INTERNAL_TOKEN 으로 주입(백엔드와 동일값)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001", "--workers", "1"]
