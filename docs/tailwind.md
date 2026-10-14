# Tailwind CSS in Lampara

Tailwind v4 lays out the interface (flex, grid, spacing, responsive breakpoints). The pixel theme colours, fonts and effects stay in the
page stylesheets (`Frontend/Css/...`).

- Input: `Frontend/assets/css/tw-input.css` (theme tokens + utilities only, no reset, so base styles are unchanged)
- Output (committed): `Frontend/assets/css/tw.css`
- Rebuild after editing any page: `./tailwindcss-cli -i Frontend/assets/css/tw-input.css -o Frontend/assets/css/tw.css --minify`
- Tailwind reads every file in `Frontend/View` and `Frontend/Js`, so classes built in JavaScript strings are included.
- Utilities sit in a CSS layer below the page stylesheets, so when both set the same property the page stylesheet wins. When a layout
  property moves to Tailwind, delete it from the page stylesheet.
- Breakpoints used: `sm:` 640px, `min-[720px]:`, `min-[760px]:`, `min-[1000px]:` for the admin, `min-[52rem]:` and `max-[40rem]:` for the home page.

Pages with their layout in Tailwind: home, "Where are you now?", manual search, the shared admin page header, stat grid and toolbars, the
account page, the visitor reports page, settings grid, data backup grid, doors layout. The outdoor guide (`guide-ar.php`) and the older
`guide.php` use the earlier compiled file `assets/css/tailwind.css` (with its reset), which is left as is.
