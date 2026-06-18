-- AlterTable
ALTER TABLE "SessionStat" ADD COLUMN     "isDuel" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxConsecRoundWins" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "playerCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "roomType" TEXT NOT NULL DEFAULT 'public',
ADD COLUMN     "wasLastPlace" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "consecutiveGameWins" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "SessionStat_isDuel_survived_idx" ON "SessionStat"("isDuel", "survived");

-- CreateIndex
CREATE INDEX "SessionStat_roomType_survived_idx" ON "SessionStat"("roomType", "survived");
