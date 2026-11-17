"""Draws a plain receipt image for the end-to-end test (needs Pillow)."""
from PIL import Image, ImageDraw, ImageFont

W, H = 1080, 1500
img = Image.new('RGB', (W, H), 'white')
draw = ImageDraw.Draw(img)
font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 64)
small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 52)
lines = [
    (font, 'IMTIAZ SUPER MARKET'),
    (small, 'Receipt #8812'),
    (small, 'Qty Item'),
    (small, '1 Rice 5kg'),
    (small, '1 Kettle'),
    (small, 'Cash 2000'),
    (small, 'Change 140'),
    (font, 'Total Rs 1,860'),
    (small, 'Purchase date: 12/10/2026'),
    (small, '1 Year Warranty'),
    (small, 'Thank you'),
]
y = 80
for f, text in lines:
    draw.text((70, y), text, fill='black', font=f)
    y += 120
img.save('e2e/receipt.png')
print('receipt.png written')
