export function updatePromptCopy(installedVersion: string, releaseVersion: string) {
  return {
    label: `LUCKYNIME V${releaseVersion} / UPDATE READY`,
    title: `Luckynime v${releaseVersion} is ready.`,
    body: `You are using v${installedVersion}. Download the verified official v${releaseVersion} APK and let Android’s system installer complete the update.`,
    installLabel: `INSTALL V${releaseVersion}`,
  };
}
