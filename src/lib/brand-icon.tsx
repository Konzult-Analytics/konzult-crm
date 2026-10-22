/** The app icon: a white K on Konzult orange, for ImageResponse. */
export function BrandIcon({ size }: { size: number }) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#ff3210",
        color: "#ffffff",
        fontSize: size * 0.62,
        fontWeight: 700,
        fontFamily: "sans-serif",
      }}
    >
      K
    </div>
  );
}
