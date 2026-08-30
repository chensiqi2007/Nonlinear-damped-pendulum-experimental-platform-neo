"""
Replicate the PendulumEngine RK4 integration from main.ts and run numerical experiments.
Produces data tables for the paper.
"""
import math
import json

# ---- Replicate PendulumEngine ----
def get_derivs(theta, omega, params, t):
    mode = params['mode']
    drive = params['driveAmp'] * math.cos(params['driveFreq'] * t) if mode == 'driven' else 0.0
    chaos = params['driveAmp'] * math.cos(params['driveFreq'] * t) if mode == 'chaotic' else 0.0
    if mode == 'small':
        nonlinear = -(params['g'] / params['L']) * theta
    else:
        nonlinear = -(params['g'] / params['L']) * math.sin(theta)
    damp_boost = params['b'] * 1.4 if mode == 'damped' else params['b']
    dTheta = omega
    dOmega = nonlinear - damp_boost * omega + drive + chaos
    return dTheta, dOmega

def rk4_step(theta, omega, t, dt, params):
    k1t, k1o = get_derivs(theta, omega, params, t)
    k2t, k2o = get_derivs(theta + k1t*dt/2, omega + k1o*dt/2, params, t + dt/2)
    k3t, k3o = get_derivs(theta + k2t*dt/2, omega + k2o*dt/2, params, t + dt/2)
    k4t, k4o = get_derivs(theta + k3t*dt, omega + k3o*dt, params, t + dt)
    theta_new = theta + dt/6*(k1t + 2*k2t + 2*k3t + k4t)
    omega_new = omega + dt/6*(k1o + 2*k2o + 2*k3o + k4o)
    return theta_new, omega_new, t + dt

def energy(theta, omega, params):
    m = params['mass']
    L = params['L']
    g = params['g']
    ek = 0.5 * m * (L * omega)**2
    ep = m * g * L * (1 - math.cos(theta))
    return ek, ep, ek + ep

def simulate(params, dt, t_max, theta0=None):
    theta = theta0 if theta0 is not None else params['theta0']
    omega = 0.0
    t = 0.0
    data = []
    while t <= t_max + 1e-12:
        ek, ep, e = energy(theta, omega, params)
        data.append((t, theta, omega, ek, ep, e))
        theta, omega, t = rk4_step(theta, omega, t, dt, params)
    return data

# ---- Experiment 1: Small angle period vs analytical ----
print("=" * 60)
print("Experiment 1: Small-angle period comparison")
print("=" * 60)
L = 1.5; g = 9.8
T_analytical = 2 * math.pi * math.sqrt(L / g)
print(f"L={L} m, g={g} m/s^2")
print(f"Analytical small-angle T0 = 2*pi*sqrt(L/g) = {T_analytical:.6f} s")
params_small = {'L': L, 'g': g, 'b': 0.0, 'mass': 1, 'theta0': 5*math.pi/180,
                'driveAmp': 0, 'driveFreq': 0, 'mode': 'small'}
# find period by zero-crossings (upward)
data = simulate(params_small, 0.001, 20)
crossings = []
for i in range(1, len(data)):
    if data[i-1][1] < 0 and data[i][1] >= 0 and data[i][2] > 0:
        # linear interpolation
        t0, t1 = data[i-1][0], data[i][0]
        th0, th1 = data[i-1][1], data[i][1]
        tc = t0 + (0 - th0)/(th1 - th0)*(t1 - t0)
        crossings.append(tc)
periods = [crossings[i+1]-crossings[i] for i in range(len(crossings)-1)]
T_num_small = sum(periods)/len(periods)
print(f"Numerical (small mode, theta0=5 deg): T = {T_num_small:.6f} s")
print(f"Relative error: {abs(T_num_small-T_analytical)/T_analytical*100:.4f}%")
print(f"Periods measured: {[f'{p:.6f}' for p in periods[:5]]}")

# Large angle (nonlinear) at 40 degrees
params_large40 = dict(params_small); params_large40['mode'] = 'large'; params_large40['theta0'] = 40*math.pi/180
data40 = simulate(params_large40, 0.001, 20)
crossings40 = []
for i in range(1, len(data40)):
    if data40[i-1][1] < 0 and data40[i][1] >= 0 and data40[i][2] > 0:
        t0, t1 = data40[i-1][0], data40[i][0]
        th0, th1 = data40[i-1][1], data40[i][1]
        tc = t0 + (0-th0)/(th1-th0)*(t1-t0)
        crossings40.append(tc)
periods40 = [crossings40[i+1]-crossings40[i] for i in range(len(crossings40)-1)]
T_num_40 = sum(periods40)/len(periods40)
# Analytical large-angle correction: T = T0 * (1 + theta0^2/16 + ...)
theta0_40 = 40*math.pi/180
T_analytical_40 = T_analytical * (1 + theta0_40**2/16 + 11*theta0_40**4/3072)
print(f"\nLarge angle theta0=40 deg:")
print(f"Numerical T = {T_num_40:.6f} s")
print(f"Analytical (2nd order correction) T = {T_analytical_40:.6f} s")
print(f"Relative error vs corrected: {abs(T_num_40-T_analytical_40)/T_analytical_40*100:.4f}%")
print(f"Period increase vs small-angle: {(T_num_40/T_analytical-1)*100:.2f}%")

# ---- Experiment 2: Energy conservation ----
print("\n" + "=" * 60)
print("Experiment 2: Energy conservation (no damping, large angle)")
print("=" * 60)
params_cons = {'L': 1.5, 'g': 9.8, 'b': 0.0, 'mass': 1, 'theta0': 40*math.pi/180,
               'driveAmp': 0, 'driveFreq': 0, 'mode': 'large'}
for dt in [0.001, 0.005, 0.01, 0.0167, 0.033]:
    data = simulate(params_cons, dt, 30)
    E0 = data[0][5]
    energies = [d[5] for d in data]
    drift = (energies[-1] - E0) / E0 * 100
    max_dev = max(abs(e - E0) for e in energies) / E0 * 100
    print(f"dt={dt:.4f}s: E0={E0:.6f} J, E_end={energies[-1]:.6f} J, drift={drift:+.6f}%, max|dev|={max_dev:.6f}%")

# ---- Experiment 3: RK4 convergence ----
print("\n" + "=" * 60)
print("Experiment 3: RK4 convergence (theta at t=10s, theta0=40 deg)")
print("=" * 60)
ref = simulate(params_cons, 0.0001, 10)
theta_ref = ref[-1][1]
print(f"Reference (dt=0.0001): theta(10) = {theta_ref:.10f}")
for dt in [0.0005, 0.001, 0.002, 0.005, 0.01, 0.02]:
    data = simulate(params_cons, dt, 10)
    theta_num = data[-1][1]
    err = abs(theta_num - theta_ref)
    print(f"dt={dt:.4f}s: theta(10)={theta_num:.10f}, abs error={err:.2e}")

# ---- Experiment 4: Damping decay ----
print("\n" + "=" * 60)
print("Experiment 4: Damped oscillation amplitude decay")
print("=" * 60)
# damped mode uses b*1.4
for b_label, b_val, boost in [("b=0.06 (large mode default)", 0.06, 1.0),
                                ("b=0.18 (damped mode, effective 0.252)", 0.18, 1.4)]:
    params_d = {'L': 1.5, 'g': 9.8, 'b': b_val, 'mass': 1, 'theta0': 40*math.pi/180,
                'driveAmp': 0, 'driveFreq': 0, 'mode': 'damped' if boost > 1 else 'large'}
    data = simulate(params_d, 0.001, 30)
    # find peaks (local maxima of theta)
    peaks = []
    for i in range(1, len(data)-1):
        if data[i][1] > data[i-1][1] and data[i][1] > data[i+1][1] and data[i][1] > 0:
            peaks.append((data[i][0], data[i][1]))
    print(f"\n{b_label}:")
    print(f"  Effective damping coeff = {b_val*boost:.4f}")
    print(f"  Theoretical decay rate gamma = b_eff/(2*m*L^2)... ")
    # For equation theta'' + (g/L)sin(theta) + b_eff*theta' = 0
    # linearized: theta'' + 2*beta*theta' + omega0^2*theta = 0, beta = b_eff/2
    beta = b_val * boost / 2
    omega0 = math.sqrt(9.8/1.5)
    omega_d = math.sqrt(omega0**2 - beta**2)
    print(f"  beta={beta:.4f}, omega_d={omega_d:.4f}, T_damped={2*math.pi/omega_d:.4f}")
    for j, (t, a) in enumerate(peaks[:6]):
        ratio = a / peaks[0][1] if j > 0 else 1.0
        theory = math.exp(-beta * t)
        print(f"  Peak {j+1}: t={t:.3f}s, A={a:.5f} rad ({math.degrees(a):.2f} deg), ratio={ratio:.4f}, exp(-bt)={theory:.4f}")

# ---- Experiment 5: g measurement simulation ----
print("\n" + "=" * 60)
print("Experiment 5: g measurement via period (simulated)")
print("=" * 60)
# L=1.5m, g=9.8, small angle, 10 periods
params_g = {'L': 1.5, 'g': 9.8, 'b': 0.0, 'mass': 1, 'theta0': 5*math.pi/180,
            'driveAmp': 0, 'driveFreq': 0, 'mode': 'small'}
data = simulate(params_g, 0.001, 30)
crossings = []
for i in range(1, len(data)):
    if data[i-1][1] < 0 and data[i][1] >= 0 and data[i][2] > 0:
        crossings.append(data[i][0])
T_total = crossings[10] - crossings[0]  # 10 periods
T_avg = T_total / 10
g_measured = 4 * math.pi**2 * 1.5 / T_avg**2
print(f"10 periods total time = {T_total:.4f} s")
print(f"T_avg = {T_avg:.6f} s")
print(f"g_measured = {g_measured:.4f} m/s^2")
print(f"Relative error = {abs(g_measured-9.8)/9.8*100:.4f}%")

# With damping (more realistic)
params_g2 = dict(params_g); params_g2['b'] = 0.02; params_g2['mode'] = 'large'
data2 = simulate(params_g2, 0.001, 30)
crossings2 = []
for i in range(1, len(data2)):
    if data2[i-1][1] < 0 and data2[i][1] >= 0 and data2[i][2] > 0.02:
        crossings2.append(data2[i][0])
T_total2 = crossings2[10] - crossings2[0]
T_avg2 = T_total2 / 10
g_measured2 = 4 * math.pi**2 * 1.5 / T_avg2**2
print(f"\nWith b=0.02 damping:")
print(f"10 periods total time = {T_total2:.4f} s")
print(f"T_avg = {T_avg2:.6f} s")
print(f"g_measured = {g_measured2:.4f} m/s^2")
print(f"Relative error = {abs(g_measured2-9.8)/9.8*100:.4f}%")

# ---- Experiment 6: Phase portrait data ----
print("\n" + "=" * 60)
print("Experiment 6: Phase portrait area decay (damped)")
print("=" * 60)
params_phase = {'L': 1.5, 'g': 9.8, 'b': 0.06, 'mass': 1, 'theta0': 40*math.pi/180,
                'driveAmp': 0, 'driveFreq': 0, 'mode': 'large'}
data = simulate(params_phase, 0.001, 20)
# sample energy at each cycle
crossings = []
for i in range(1, len(data)):
    if data[i-1][1] < 0 and data[i][1] >= 0 and data[i][2] > 0.02:
        crossings.append(i)
for ci in crossings[:8]:
    t, th, om, ek, ep, e = data[ci]
    print(f"  t={t:.3f}s: theta={th:.4f}, omega={om:.4f}, E={e:.6f} J")

print("\nDone.")
