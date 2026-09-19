export type EngineeringCalc =
  | "ohms-law"
  | "dc-power"
  | "beam-simply-supported-center-load"
  | "shaft-torsion"
  | "reynolds-number"
  | "heat-conduction-plane-wall"
  | "kinetic-energy";

function n(v: unknown, name: string) { const x = Number(v); if (!Number.isFinite(x)) throw new Error(`${name} must be numeric.`); return x; }

export function engineeringCalculate(kind: EngineeringCalc, args: Record<string, unknown>) {
  if (kind === "ohms-law") {
    const V = args.voltage != null ? n(args.voltage, "voltage") : undefined;
    const I = args.current != null ? n(args.current, "current") : undefined;
    const R = args.resistance != null ? n(args.resistance, "resistance") : undefined;
    if (V != null && I != null && Math.abs(I) > 0) return { resistanceOhm: V / I, equation: "R=V/I" };
    if (V != null && R != null && Math.abs(R) > 0) return { currentA: V / R, equation: "I=V/R" };
    if (I != null && R != null) return { voltageV: I * R, equation: "V=IR" };
    throw new Error("Provide any two of voltage, current, resistance.");
  }
  if (kind === "dc-power") {
    const V=n(args.voltage,"voltage"), I=n(args.current,"current"); return { powerW: V*I, equation:"P=VI" };
  }
  if (kind === "beam-simply-supported-center-load") {
    const P=n(args.loadN,"loadN"), L=n(args.lengthM,"lengthM"), E=n(args.elasticModulusPa,"elasticModulusPa"), I=n(args.secondMomentM4,"secondMomentM4");
    if (L<=0||E<=0||I<=0) throw new Error("length, elastic modulus and second moment must be positive.");
    return { maxDeflectionM: P*Math.pow(L,3)/(48*E*I), maxMomentNm:P*L/4, equation:"δmax=PL^3/(48EI), Mmax=PL/4", assumptions:["linear elastic","small deflection","simple supports","center point load"] };
  }
  if (kind === "shaft-torsion") {
    const T=n(args.torqueNm,"torqueNm"), r=n(args.radiusM,"radiusM"), J=n(args.polarMomentM4,"polarMomentM4"); if(r<=0||J<=0)throw new Error("radius and polar moment must be positive."); return { maxShearStressPa:T*r/J, equation:"τmax=Tr/J" };
  }
  if (kind === "reynolds-number") {
    const rho=n(args.densityKgM3,"densityKgM3"), v=n(args.velocityMs,"velocityMs"), D=n(args.characteristicLengthM,"characteristicLengthM"), mu=n(args.dynamicViscosityPaS,"dynamicViscosityPaS");if(mu<=0)throw new Error("dynamic viscosity must be positive."); return { reynolds:rho*v*D/mu, equation:"Re=ρvD/μ" };
  }
  if (kind === "heat-conduction-plane-wall") {
    const k=n(args.conductivityWmK,"conductivityWmK"), A=n(args.areaM2,"areaM2"), dT=n(args.deltaTK,"deltaTK"), L=n(args.thicknessM,"thicknessM");if(L<=0)throw new Error("thickness must be positive."); return { heatRateW:k*A*dT/L, equation:"Q=kAΔT/L", assumptions:["steady-state","1-D conduction","constant k"] };
  }
  if (kind === "kinetic-energy") {
    const m=n(args.massKg,"massKg"), v=n(args.velocityMs,"velocityMs");return { kineticEnergyJ:.5*m*v*v,equation:"E=½mv²" };
  }
  throw new Error("Unknown engineering calculator.");
}
