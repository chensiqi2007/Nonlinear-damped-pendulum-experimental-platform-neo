# -*- coding: utf-8 -*-
"""Compute forced vibration resonance curve and 144fps energy data."""
import numpy as np
import json
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib import rcParams
rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei']
rcParams['axes.unicode_minus'] = False

g, L, m = 9.8, 1.5, 1.0
omega0 = np.sqrt(g / L)

def deriv(state, t, b, A, Omega):
    th, om = state
    return np.array([om, -(g/L)*np.sin(th) - b*om + A*np.cos(Omega*t)])

def rk4_step(state, t, dt, b, A, Omega):
    k1 = deriv(state, t, b, A, Omega)
    k2 = deriv(state + 0.5*dt*k1, t + 0.5*dt, b, A, Omega)
    k3 = deriv(state + 0.5*dt*k2, t + 0.5*dt, b, A, Omega)
    k4 = deriv(state + dt*k3, t + dt, b, A, Omega)
    return state + (dt/6.0)*(k1 + 2*k2 + 2*k3 + k4)

# --- 1. Forced vibration: resonance curve (linearized) ---
# For small angles, resonance at omega_d = sqrt(omega0^2 - 2*beta^2)
# Use b=0.1 (beta=0.05), A=0.5
b_forced = 0.1
beta = b_forced / 2
A_drive = 0.5
Omegas = np.linspace(2.0, 3.2, 50)
amps_linear = []
amps_nonlinear = []

for Om in Omegas:
    # Linear theory: amplitude = A / sqrt((omega0^2 - Om^2)^2 + (b*Om)^2)
    amp_lin = A_drive / np.sqrt((omega0**2 - Om**2)**2 + (b_forced*Om)**2)
    amps_linear.append(amp_lin)
    
    # Nonlinear simulation: start from rest, integrate long enough to reach steady state
    state = np.array([0.0, 0.0])
    dt = 0.001
    t = 0.0
    # Run for 120 seconds to reach steady state
    for _ in range(int(120/dt)):
        state = rk4_step(state, t, dt, b_forced, A_drive, Om)
        t += dt
    # Measure amplitude over next 20 seconds
    th_max = 0
    for _ in range(int(20/dt)):
        state = rk4_step(state, t, dt, b_forced, A_drive, Om)
        t += dt
        th_max = max(th_max, abs(state[0]))
    amps_nonlinear.append(th_max)

# Find resonance peak
idx_peak_lin = np.argmax(amps_linear)
idx_peak_nl = np.argmax(amps_nonlinear)
print(f"Linear resonance: Omega={Omegas[idx_peak_lin]:.4f} rad/s, amp={amps_linear[idx_peak_lin]:.4f} rad ({np.degrees(amps_linear[idx_peak_lin]):.1f} deg)")
print(f"Nonlinear resonance: Omega={Omegas[idx_peak_nl]:.4f} rad/s, amp={amps_nonlinear[idx_peak_nl]:.4f} rad ({np.degrees(amps_nonlinear[idx_peak_nl]):.1f} deg)")
print(f"omega0={omega0:.4f}, linear theory resonance freq={np.sqrt(omega0**2 - 2*beta**2):.4f}")

# Plot resonance curve
fig, ax = plt.subplots(figsize=(7, 4.5))
ax.plot(Omegas, np.degrees(amps_linear), 'b--', linewidth=1.5, label='线性理论')
ax.plot(Omegas, np.degrees(amps_nonlinear), 'r-', linewidth=1.5, label='非线性数值解')
ax.axvline(omega0, color='gray', linestyle=':', linewidth=1, label=f'ω₀={omega0:.3f} rad/s')
ax.set_xlabel('驱动角频率 Ω (rad/s)', fontsize=11)
ax.set_ylabel('稳态振幅 (°)', fontsize=11)
ax.set_title('受迫振动幅频曲线（b=0.1 s⁻¹, A=0.5 rad/s²）', fontsize=12)
ax.legend(fontsize=10)
ax.grid(True, alpha=0.3)
plt.tight_layout()
plt.savefig(r'D:\physicalexam\fig_forced_resonance.png', dpi=200, bbox_inches='tight')
plt.close()
print("Saved fig_forced_resonance.png")

# --- 2. Phase portrait at resonance ---
state = np.array([0.0, 0.0])
dt = 0.001
t = 0.0
th_list, om_list = [], []
# Run 120s transient
for _ in range(int(120/dt)):
    state = rk4_step(state, t, dt, b_forced, A_drive, Omegas[idx_peak_nl])
    t += dt
# Record 20s
for _ in range(int(20/dt)):
    state = rk4_step(state, t, dt, b_forced, A_drive, Omegas[idx_peak_nl])
    t += dt
    if _ % 5 == 0:
        th_list.append(state[0])
        om_list.append(state[1])

fig, ax = plt.subplots(figsize=(6, 5))
ax.plot(np.degrees(th_list), om_list, 'b-', linewidth=0.5, alpha=0.7)
ax.set_xlabel('θ (°)', fontsize=11)
ax.set_ylabel('ω (rad/s)', fontsize=11)
ax.set_title(f'共振态相图（Ω={Omegas[idx_peak_nl]:.3f} rad/s）', fontsize=12)
ax.grid(True, alpha=0.3)
ax.axhline(0, color='k', linewidth=0.5)
ax.axvline(0, color='k', linewidth=0.5)
plt.tight_layout()
plt.savefig(r'D:\physicalexam\fig_forced_phase.png', dpi=200, bbox_inches='tight')
plt.close()
print("Saved fig_forced_phase.png")

# --- 3. Energy drift at 144fps (dt=0.0067) ---
def energy(state):
    th, om = state
    return 0.5*m*L**2*om**2 + m*g*L*(1 - np.cos(th))

dt_144 = 1/144  # ~0.00694
state = np.array([np.radians(40), 0.0])
E0 = energy(state)
t = 0.0
times, drifts = [], []
n_steps = int(30/dt_144)
for i in range(n_steps):
    state = rk4_step(state, t, dt_144, 0, 0, 0)
    t += dt_144
    E = energy(state)
    drift = (E - E0) / E0 * 100
    if i % 100 == 0:
        times.append(t)
        drifts.append(drift)
E_end = energy(state)
drift_end = (E_end - E0) / E0 * 100
print(f"\n144fps (dt={dt_144:.5f}s): E0={E0:.6f}, E_end={E_end:.6f}, drift={drift_end:.2e}%")
print(f"Max abs drift: {max(abs(d) for d in drifts):.2e}%")

# Save data
results = {
    'forced': {
        'b': b_forced, 'A': A_drive,
        'omega0': float(omega0),
        'linear_resonance_Omega': float(Omegas[idx_peak_lin]),
        'linear_resonance_amp_deg': float(np.degrees(amps_linear[idx_peak_lin])),
        'nonlinear_resonance_Omega': float(Omegas[idx_peak_nl]),
        'nonlinear_resonance_amp_deg': float(np.degrees(amps_nonlinear[idx_peak_nl])),
    },
    'energy_144fps': {
        'dt': dt_144,
        'drift_end': drift_end,
        'max_drift': max(abs(d) for d in drifts),
    }
}
with open(r'D:\physicalexam\forced_results.json', 'w') as f:
    json.dump(results, f, indent=2)
print("\nResults saved.")
