#!/bin/bash
ffmpeg -y -f lavfi -i 'testsrc=duration=5:size=1280x720:rate=30' -f lavfi -i 'sine=frequency=880:duration=5' -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest /tmp/test_dog2.mp4
ls -lh /tmp/test_dog2.mp4
