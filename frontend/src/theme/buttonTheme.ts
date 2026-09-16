/**
 * The app's single button language, expressed as antd Button component tokens.
 *
 * Everything antd can express as a token lives here rather than in per-button utility
 * classes. `index.css` adds only what tokens cannot reach: the hover lift, the press,
 * the focus-ring offset, and the elevation that belongs to solid fills alone.
 *
 * Shadows: antd applies `primaryShadow` / `defaultShadow` / `dangerShadow` on the *color*
 * rule, which `outlined` and `dashed` variants inherit (only `text`, `link`, `filled` and
 * `ghost` reset it). They must therefore stay a hairline — solid buttons get their real
 * elevation from `.ant-btn-variant-solid` in `index.css`.
 */

/** Resting shadow. Inherited by outlined/dashed, so it can only ever be a hairline. */
const HAIRLINE_SHADOW = '0 1px 2px 0 rgb(15 23 42 / 0.05)'

export const buttonTheme = (isDark: boolean) => ({
    fontWeight: 600,
    /** 44 / 36 / 28 — real touch targets; antd's 24px small button is cramped in table rows. */
    controlHeightLG: 44,
    controlHeight: 36,
    controlHeightSM: 28,
    contentFontSizeLG: 15,
    contentFontSize: 14,
    contentFontSizeSM: 13,
    paddingInlineLG: 20,
    paddingInline: 16,
    paddingInlineSM: 12,
    onlyIconSizeLG: 18,
    onlyIconSize: 16,
    onlyIconSizeSM: 14,
    /** Tighter than the 10/12 surface radius: crisp corners read as enterprise, not consumer. */
    borderRadiusLG: 10,
    borderRadius: 8,
    borderRadiusSM: 6,
    /** Hover darkens the fill. antd lightens by default, which reads playful rather than considered. */
    colorPrimaryHover: '#1d4ed8',
    colorPrimaryActive: '#1e40af',
    colorErrorHover: '#be123c',
    colorErrorActive: '#9f1239',
    colorErrorBorderHover: '#fb7185',
    defaultShadow: HAIRLINE_SHADOW,
    primaryShadow: HAIRLINE_SHADOW,
    dangerShadow: HAIRLINE_SHADOW,
    /** antd renders focus as `outline: lineWidthFocus solid colorPrimaryBorder`. */
    lineWidthFocus: 3,
    colorPrimaryBorder: isDark
        ? 'rgb(56 189 248 / 0.45)'
        : 'rgb(37 99 235 / 0.35)',
    /** Secondary buttons stay neutral on hover — a blue border would compete with the primary. */
    ...(isDark
        ? {
              defaultBg: 'rgb(30 41 59 / 0.75)',
              defaultColor: 'rgb(226 232 240)',
              defaultBorderColor: 'rgb(71 85 105 / 0.9)',
              defaultHoverBg: 'rgb(51 65 85 / 0.9)',
              defaultHoverColor: 'rgb(241 245 249)',
              defaultHoverBorderColor: 'rgb(100 116 139)',
              defaultActiveBg: 'rgb(30 41 59)',
              defaultActiveColor: 'rgb(241 245 249)',
              defaultActiveBorderColor: 'rgb(148 163 184)',
              borderColorDisabled: 'rgb(51 65 85 / 0.8)',
              textHoverBg: 'rgb(51 65 85 / 0.6)',
          }
        : {
              defaultBg: '#ffffff',
              defaultColor: 'rgb(51 65 85)',
              defaultBorderColor: 'rgb(203 213 225)',
              defaultHoverBg: 'rgb(248 250 252)',
              defaultHoverColor: 'rgb(15 23 42)',
              defaultHoverBorderColor: 'rgb(148 163 184)',
              defaultActiveBg: 'rgb(241 245 249)',
              defaultActiveColor: 'rgb(15 23 42)',
              defaultActiveBorderColor: 'rgb(100 116 139)',
              borderColorDisabled: 'rgb(226 232 240)',
              textHoverBg: 'rgb(241 245 249)',
          }),
})
