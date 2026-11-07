const params = { length: 1.5, gravity: 9.8, damping: 0, mass: 1, theta0: 1.2 };
let theta = params.theta0;
let omega = 0;
const stepSize = 0.00001;
const initialEnergy = params.mass * params.gravity * params.length * (1 - Math.cos(theta));
let maxRelativeDrift = 0;

for (let step = 0; step < 1_000_000; step += 1) {
  const acceleration = -(params.gravity / params.length) * Math.sin(theta);
  const nextTheta = theta + omega * stepSize + 0.5 * acceleration * stepSize * stepSize;
  const nextAcceleration = -(params.gravity / params.length) * Math.sin(nextTheta);
  omega += 0.5 * (acceleration + nextAcceleration) * stepSize;
  theta = nextTheta;
  const energy = 0.5 * params.mass * (params.length * omega) ** 2 + params.mass * params.gravity * params.length * (1 - Math.cos(theta));
  maxRelativeDrift = Math.max(maxRelativeDrift, Math.abs((energy - initialEnergy) / initialEnergy));
}

console.log(`10 s conservative run: max energy drift ${(maxRelativeDrift * 100).toExponential(3)}%`);
if (maxRelativeDrift > 0.0001) process.exitCode = 1;
