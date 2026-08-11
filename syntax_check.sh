#!/bin/bash
for file in *.gs; do
  cp "$file" "${file%.gs}.js"
  node -c "${file%.gs}.js"
  if [ $? -ne 0 ]; then
    echo "Syntax error in $file"
    rm "${file%.gs}.js"
    # don't exit so bash session survives, but break
    break
  fi
  rm "${file%.gs}.js"
done
echo "Syntax check complete."
