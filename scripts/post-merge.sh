#!/bin/bash
# يُشغَّل تلقائياً بعد دمج أي تغييرات (post-merge hook)
set -e

echo "📦 تثبيت المكتبات..."
pnpm install --frozen-lockfile

echo "✅ تم التثبيت بنجاح."
# ملاحظة: لا نُشغّل drizzle-kit push هنا لأن قاعدة البيانات على Neon موجودة مسبقاً
# شغّل يدوياً فقط إذا أضفت جداول جديدة: pnpm --filter db push
