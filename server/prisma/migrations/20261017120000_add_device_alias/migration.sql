-- CreateTable
CREATE TABLE "DeviceAlias" (
    "deviceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeviceAlias_pkey" PRIMARY KEY ("deviceId")
);

-- CreateIndex
CREATE INDEX "DeviceAlias_userId_idx" ON "DeviceAlias"("userId");

-- AddForeignKey
ALTER TABLE "DeviceAlias" ADD CONSTRAINT "DeviceAlias_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
