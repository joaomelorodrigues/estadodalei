import {
  Briefcase,
  Building2,
  Compass,
  GraduationCap,
  HeartHandshake,
  Home,
  KeyRound,
  Stethoscope,
  Users,
  Wallet,
} from "lucide-react";

interface GroupIconProps {
  name: string;
  className?: string;
}

export function GroupIcon({ name, className = "size-4" }: GroupIconProps) {
  switch (name) {
    case "Briefcase":
      return <Briefcase className={className} />;
    case "Compass":
      return <Compass className={className} />;
    case "Users":
      return <Users className={className} />;
    case "KeyRound":
      return <KeyRound className={className} />;
    case "Home":
      return <Home className={className} />;
    case "HeartHandshake":
      return <HeartHandshake className={className} />;
    case "Building2":
      return <Building2 className={className} />;
    case "Stethoscope":
      return <Stethoscope className={className} />;
    case "GraduationCap":
      return <GraduationCap className={className} />;
    case "Wallet":
      return <Wallet className={className} />;
    default:
      return <Users className={className} />;
  }
}
