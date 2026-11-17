# Paperwork end-to-end: import a receipt image through the system picker, check that on-device
# text recognition finds the title, total and warranty date, save it encrypted, and search it.
# Sourced by smoke.sh (helpers come from there).

adb push e2e/receipt.png /sdcard/Download/receipt.png >/dev/null
adb shell content call --uri content://media --method scan_volume --arg external_primary >/dev/null 2>&1

tap_text "Library"; sleep 3
tap_text "Import"; sleep 6
shot e2e-picker
if wait_contains "receipt.png" 4; then
  tap_text "receipt.png"; sleep 2
elif tap_res "icon_thumb" || tap_res "thumbnail"; then
  sleep 2
else
  fail "the receipt is visible in the system picker"
  shot e2e-picker-missing
fi
# Some picker versions need a confirming tap on Select.
has_text "Select" && tap_text "Select"

expect "Save document" 60 "the page is read and the review screen opens"
shot e2e-review
expect "Imtiaz Super Market" 5 "title suggested from the text"
expect "1,860" 5 "total recognised"
expect "Receipt" 5 "type recognised as a receipt"
expect "Warranty ends" 5 "warranty end date worked out from '1 Year Warranty'"

tap_text "Save document"; sleep 6
expect "Copy text" 20 "the document saved and its page opened"
shot e2e-document
adb shell input keyevent KEYCODE_BACK; sleep 3
expect "Imtiaz Super Market" 10 "the saved document is in the library"

tap_text "Search text inside every document"; sleep 1
type_text "kettle"; sleep 4
expect "Imtiaz Super Market" 10 "full-text search finds a word printed on the receipt"
shot e2e-search
adb shell input keyevent KEYCODE_BACK; sleep 1
