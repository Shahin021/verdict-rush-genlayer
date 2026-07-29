import PrivyAuthWall from "./auth-wall";
import VerdictRushPrivyProvider from "./privy-provider";

export default function VerdictRushV2Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <VerdictRushPrivyProvider>
      <PrivyAuthWall>{children}</PrivyAuthWall>
    </VerdictRushPrivyProvider>
  );
}
