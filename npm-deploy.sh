#!/bin/bash
git add -A
git commit -m "Deploy $(date +%s)" --allow-empty
printf "main\ny\n" | timeout 30 caprover deploy -n captain-01 -a menuqr || echo "Deployment initiated"
echo "✅ Deployment command sent to CapRover"