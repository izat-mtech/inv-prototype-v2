# Fish Inventory Prototype

This browser prototype uses fictional records. The profile switch at the top left changes between Store Officer and Supervisor. Select **Reset demo data** from the same menu to restore the sample records. Changes stay in the current browser.

| Tab | Demonstration |
| --- | --- |
| Dashboard | All-city or city-specific stock, trends, recent activity and shortcuts to Inventory, Stock Receive, Stock Issue and Reports |
| Inventory | Searchable stock by batch and city, with on-hand, available, held, spoiled and in-transit quantities |
| Stock Receive | Create a receipt, then approve and post it as Supervisor |
| Stock Issue | Record the recipient and purpose, approve the issue, then confirm handover |
| Stock Transfer | Review transfers, dispatch and confirm full or partial arrival. The Adjustments view records and reviews corrections |
| Spoilage | Place stock on hold for review, confirm spoilage, and separately approve and confirm disposal |
| Stocktaking | Open a city snapshot, count every batch in scope and submit for reconciliation while movements continue |
| Approvals | Review pending transactions, adjustments and stocktakes in one queue, or review from each record's own tab |
| Audit Trail | View and filter transaction events, stocktake decisions, profile switches and report export actions |
| Reports | Inventory, Movement, Spoilage and Audit reports, with CSV export and browser printing to PDF |

Demo cities are **Kuching, Miri, Sibu and Bintulu**. Pick a city in Dashboard before opening a shortcut to carry that filter into the next view. When an earlier demo is present in this browser, Site A and Site B records are mapped to Kuching and Miri. **Reset demo data** seeds all four cities.

In a transaction tab, select a reference to review or act on it. Try the pending 100 kg receipt in **Stock Receive** or **Approvals**. Approving it as Supervisor adds the batch to Inventory and updates the dashboard and reports.

### Count while stock is moving

1. As Store Officer, open **Stocktaking → Start stocktake** and select a city.
2. Enter each physical weight and select **Record** when it is observed. The system saves the expected balance for that batch at the same time. Any stock movement before that count is included in the expected balance.
3. Submit the sheet and open it as Supervisor in **Stocktaking** or **Approvals**. Review the opening snapshot, expected-at-count weight and variance. Approval posts only the variance against the current available balance. A decrease that exceeds current available stock is blocked for investigation or recount.

For example, if the snapshot is 100 kg, 20 kg is issued before counting and 77 kg is found, the variance is −3 kg. If another 10 kg is issued before approval, the current balance is 70 kg and the approved variance brings it to 67 kg.

## Update an existing GitHub Pages repo

1. Copy the contents of this folder into your existing GitHub repo checkout, including `.github/workflows/deploy.yml`. Keep the repo's `.git` directory.
2. From that checkout, commit and push to `main`.
3. Verify **Settings → Pages → Source** is set to **GitHub Actions**.
4. Check **Actions → Deploy to GitHub Pages** for a successful run. If necessary, enable the workflow and run it manually on `main`. The published URL is shown under **Settings → Pages**.

## Start a new GitHub Pages repo

1. Create an empty GitHub repository called `fish-inventory-prototype`. For the free public Pages setup, choose Public and leave README, gitignore and license unchecked. Commit only fictional records and source intended to be public.
2. Open the extracted project folder in VS Code. Run the following in its terminal, replacing `YOUR-USERNAME` with your GitHub username.

   ```powershell
   git init -b main
   git add .
   git commit -m "Add fish inventory prototype"
   git remote add origin https://github.com/YOUR-USERNAME/fish-inventory-prototype.git
   git push -u origin main
   ```

3. Set **Settings → Pages → Source** to **GitHub Actions**, then select **Actions → Deploy to GitHub Pages → Run workflow** on `main`. The initial push can trigger a run before Pages is configured. If it does, run it again after selecting the source.

The Vite build uses relative asset URLs and hash navigation for repository subfolders. Pushes to `main` update the same Pages URL when the workflow is enabled.

## Run in VS Code

Use Node.js 24 LTS.

```powershell
npm ci
npm run dev
npm run build
```

The role switch simulates access for a walkthrough. This static demo uses browser storage for its transaction history.
