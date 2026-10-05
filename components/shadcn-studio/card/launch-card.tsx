import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { LaunchRecord } from "@/lib/launches";

/** Recent-launch card, in the shadcn-studio card-05 layout (top image,
 * header below, footer actions). Primary action opens the coin on pump.fun;
 * the outline action pre-fills a boost for the coin. */
export function LaunchCard({ launch }: { launch: LaunchRecord }) {
  return (
    <Card className="h-full pt-0">
      <CardContent className="px-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={launch.imageUri}
          alt={`Image of the coin ${launch.name}`}
          className="aspect-video w-full rounded-t-xl object-cover"
          loading="lazy"
        />
      </CardContent>
      <CardHeader>
        <CardTitle className="truncate">{launch.symbol}</CardTitle>
        <CardDescription className="truncate">{launch.name}</CardDescription>
      </CardHeader>
      <CardFooter className="gap-3 max-sm:flex-col max-sm:items-stretch">
        <a
          href={`https://pump.fun/coin/${launch.mint}`}
          target="_blank"
          rel="noreferrer"
          className={buttonVariants({})}
        >
          View coin
        </a>
        <Link
          href={`/launch/boost?mint=${launch.mint}`}
          className={buttonVariants({ variant: "outline" })}
        >
          Boost
        </Link>
      </CardFooter>
    </Card>
  );
}
