'use strict';

import EC2 = require('aws-sdk/clients/ec2');

export interface ImageTag {
  name: string
  value: string
}

export interface LambdaEvent {
  imageTags: ImageTag[]
  dryRun?: boolean
  verbose?: boolean
  deleteFirst?: boolean
}

async function processEvent(event: LambdaEvent) {

  if (event.verbose) {
    console.log("Received event:", JSON.stringify(event));
  }
  // We need to retrieve all AMIs.
  var ec2 = new EC2();
  let images = await ec2.describeImages({
    Filters: event.imageTags.map((t) => {
      return { Name: t.name, Values: [t.value] }
    })
  }).promise();

  if (!images.Images) {
    console.log("No images found. Skipping")
    return
  }

  if (images.Images.length <= 1) {
    console.log("One or less images present. Skipping.")
    return
  }

  // Sort the images
  images.Images.sort((a, b) => {
    if (!a.CreationDate || !b.CreationDate) { return 0; }
    let aDate = Date.parse(a.CreationDate);
    let bDate = Date.parse(b.CreationDate)
    // return aDate - bDate // Sort ascending
    return bDate - aDate // Sort descending
  });

  if (event.verbose) {
    console.log("Sorted images:")
    images.Images.forEach((img) => {
      console.log("-", img.CreationDate)
    })
    images.Images.forEach(async (image, index) => {
      if (index == 0 && !event.deleteFirst) {
        console.log("First image will be skipped:", image.ImageId)
      } else {
        console.log("This will be deleted:", image.ImageId)
      }
    })
  }

  for (let index = 0; index < images.Images.length; index++) {
    let image = images.Images[index]
    if (index == 0 && !event.deleteFirst) {
      if (event.verbose) {
        console.log("Skipping first image:", image.ImageId)
      }
      continue
    }
    if (!image.ImageId) {
      console.log("Skipping image with no image ID")
      continue
    }
    console.log("Found image (to be deleted):", image.ImageId, "-", image.Name);

    // Do not proceed if dryRun has been set to 'true'
    if (event.dryRun) {
      console.log("Not proceeding with deletion as dryRun is 'true'.")
      continue
    }

    // Get the snapshot ID(s) for thsi image
    var snapshotIds: string[] = [];
    if (image.BlockDeviceMappings) {
      for (let index = 0; index < image.BlockDeviceMappings.length; index++) {

        let mapping = image.BlockDeviceMappings[index]

        if (mapping.Ebs && mapping.Ebs.SnapshotId) {
          console.log("Will delete snapshot after the AMI:", mapping.Ebs.SnapshotId);
          snapshotIds.push(mapping.Ebs.SnapshotId);
        } else {
          if (event.verbose) {
            console.log("No EBS snapshot detected for mapping:", JSON.stringify(mapping))
          }
        }
      }
    }

    // Delete the AMI
    if (event.verbose) {
      console.log("Attempting to deregister", image.ImageId)
    }
    let deregisterParams: EC2.DeregisterImageRequest = { ImageId: image.ImageId }
    let deregisterResponse = await ec2.deregisterImage(deregisterParams).promise();
    if (deregisterResponse.$response.httpResponse.statusCode != 200) {
      console.log("Non-200 response code returned when trying to delete AMI:", image.ImageId)
      continue
    }
    console.log("Deregistered AMI:", image.ImageId);

    // Delete the snapshot(s)
    for (let index = 0; index < snapshotIds.length; index++) {
      let snapshotId = snapshotIds[index];
      let snapshotDeleteParams: EC2.DeleteSnapshotRequest = { SnapshotId: snapshotId }
      let snapshotDeleteResponse = await ec2.deleteSnapshot(snapshotDeleteParams).promise();
      if (snapshotDeleteResponse.$response.httpResponse.statusCode != 200) {
        console.warn("Non-200 response code returned when trying to delete snapshot:", snapshotId);
        continue
      }
      console.log("Deleted snapshot:", snapshotId);
    }
  };
}

exports.handler = async (event: LambdaEvent, context: any): Promise<any> => {
  await processEvent(event);
};

if (process.env.RUN_LOCALLY?.trim().toLowerCase() == "true") {
  processEvent({
    imageTags: [{ name: "deleteme", value: "true" }],
    dryRun: true,
    verbose: true,
  });
}