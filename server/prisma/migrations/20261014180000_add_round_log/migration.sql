-- CreateTable
CREATE TABLE "RoundLog" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "roomType" TEXT NOT NULL,
    "playerCount" INTEGER NOT NULL,
    "humanCount" INTEGER NOT NULL,
    "humanPicks" INTEGER[],
    "invalidCount" INTEGER NOT NULL DEFAULT 0,
    "average" DOUBLE PRECISION,
    "target" DOUBLE PRECISION,
    "targetMultiplier" DOUBLE PRECISION NOT NULL,
    "isVoid" BOOLEAN NOT NULL DEFAULT false,
    "exactMatch" BOOLEAN NOT NULL DEFAULT false,
    "isDuel" BOOLEAN NOT NULL DEFAULT false,
    "humanWon" BOOLEAN NOT NULL DEFAULT false,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoundLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RoundLog_playedAt_idx" ON "RoundLog"("playedAt");

-- CreateIndex
CREATE INDEX "RoundLog_gameId_idx" ON "RoundLog"("gameId");

