#!/bin/sh
# ═══════════════════════════════════════════════════════════════
# تشغيل كل اختبارات دفتر هود الذكي
# ═══════════════════════════════════════════════════════════════
cd "$(dirname "$0")/.." || exit 1

if ! command -v node > /dev/null 2>&1; then
  echo "✗ يحتاج Node.js. ثبّته عبر: apk add nodejs"
  exit 1
fi

TOTAL_FAIL=0

for suite in run dialect stress; do
  case "$suite" in
    run)     NAME="المنطق الأساسي" ;;
    dialect) NAME="العربية واللهجة اليمنية" ;;
    stress)  NAME="التحمل وسلامة البيانات" ;;
  esac
  echo ""
  echo "══════════════════════════════════════════════════════════"
  echo "  $NAME"
  echo "══════════════════════════════════════════════════════════"
  if node "test/$suite.js"; then
    :
  else
    TOTAL_FAIL=$((TOTAL_FAIL + 1))
  fi
done

echo ""
echo "══════════════════════════════════════════════════════════"
if [ "$TOTAL_FAIL" -eq 0 ]; then
  echo "  ✓ جميع مجموعات الاختبارات نجحت"
  echo ""
  echo "  لاختبار الواجهة في المتصفح:"
  echo "    python3 -m http.server 8000"
  echo "    ثم افتح http://localhost:8000/test/ui-test.html"
  echo "══════════════════════════════════════════════════════════"
  exit 0
else
  echo "  ✗ فشلت $TOTAL_FAIL مجموعة"
  echo "══════════════════════════════════════════════════════════"
  exit 1
fi