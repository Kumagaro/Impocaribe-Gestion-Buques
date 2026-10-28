// T127 y T128 · RF-RED-04: el QR de emparejamiento de la pantalla del servidor (P-28 al terminar, P-29). Se dibuja
// como SVG (nítido a cualquier tamaño), sin red: la codificación la hace uqr en la propia app.
import { encode } from 'uqr';

export function QrCode({ value, label }: { value: string; label: string }) {
  const { data, size } = encode(value, { ecc: 'M', border: 2 });
  let path = '';
  data.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) path += `M${x} ${y}h1v1h-1z`;
    }),
  );
  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label={label}>
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
