import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const dir = dirname(fileURLToPath(import.meta.url));
const intervals = 96;

function timeAt(index) {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

const ami = ["timestamp,meter_id,p_kw,q_kvar,quality"];
const measurements = ["timestamp,asset_id,measurement_type,phase,value,unit,quality"];

for (let index = 0; index < intervals; index += 1) {
  const time = timeAt(index);
  const shape = 0.78 + 0.22 * Math.sin((index / intervals) * Math.PI * 2 - Math.PI / 2);
  const loads = [
    ["M-001", 15.0 * shape],
    ["M-002", 17.0 * shape],
    ["M-003", 14.0 * shape],
  ];

  for (const [meterId, pKw] of loads) {
    const qKvar = pKw * 0.329;
    ami.push(`${time},${meterId},${pKw.toFixed(4)},${qKvar.toFixed(4)},GOOD`);
  }

  const customerKw = loads.reduce((sum, [, pKw]) => sum + pKw, 0);
  const measuredSourceKw = customerKw * 1.03;
  measurements.push(`${time},GRID,P,ABC,${measuredSourceKw.toFixed(4)},kW,GOOD`);
}

writeFileSync(join(dir, "ami.csv"), `${ami.join("\n")}\n`, "utf8");
writeFileSync(join(dir, "measurements.csv"), `${measurements.join("\n")}\n`, "utf8");

console.log(`Generated ${intervals} source intervals and ${intervals * 3} AMI points in ${dir}`);
