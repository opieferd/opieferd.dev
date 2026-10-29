const copyBitcoinButton = document.getElementById('copy-bitcoin-address');
const bitcoinAddress = document.getElementById('bitcoin-address');
if (copyBitcoinButton && bitcoinAddress) {
  const copyLabel = document.getElementById('bitcoin-copy-label');
  const copyStatus = document.getElementById('bitcoin-copy-status');
  let copyReset;
  copyBitcoinButton.addEventListener('click', async () => {
    clearTimeout(copyReset);
    copyBitcoinButton.disabled = true;
    try {
      await navigator.clipboard.writeText(bitcoinAddress.textContent.trim());
      copyLabel.textContent = 'Copied';
      copyStatus.textContent = 'Bitcoin address copied.';
      copyReset = setTimeout(() => {
        copyLabel.textContent = 'Copy address';
        copyStatus.textContent = '';
      }, 2500);
    } catch {
      copyLabel.textContent = 'Copy address';
      copyStatus.textContent = 'Copy the Bitcoin address shown above.';
    } finally {
      copyBitcoinButton.disabled = false;
    }
  });
}
